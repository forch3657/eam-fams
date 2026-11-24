package com.fams.module.liuxun;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 柳讯 HTTP 客户端：授权码换 token、按手机号查用户。
 *
 * <p>mock=true 时全部走本地桩，不产生任何出站请求；这样在柳讯侧尚未注册
 * redirect_uri / 分配 system scope 时，也能把前端路由、用户映射和待办结构
 * 全流程跑通。真实模式只依赖 RestTemplate（JDK8/Spring5 可用）。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiuxunOAuth2Client {

    private final LiuxunProperties properties;
    private final ObjectMapper objectMapper;

    /** 客户端模式 token 缓存（无 refresh_token 接口，到期后重新获取） */
    private volatile CachedToken clientToken;

    private volatile RestTemplate restTemplate;

    /**
     * 授权码换 token。
     * 真实调用 POST {baseUrl}/oauth/token，grant_type=authorization_code。
     */
    public LiuxunTokenResponse exchangeCodeForToken(String code) {
        if (properties.isMock()) {
            return mockToken(true);
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", properties.getClientId());
        form.add("client_secret", properties.getClientSecret());
        form.add("grant_type", "authorization_code");
        form.add("redirect_uri", properties.getRedirectUri());
        form.add("code", code);
        LiuxunTokenResponse result = postForm("/oauth/token", form, LiuxunTokenResponse.class);
        log.info("[liuxun] code exchanged: scope={} accountInfo={}", result.getScope(),
                result.getAccountInfo() == null ? "null" : result.getAccountInfo().keySet().toString());
        return result;
    }

    /**
     * 用柳讯账号密码走一次「授权页会话登录 → 授权码 → token」换用户 token。
     * 密码只在本次 HTTP 请求体里出现，不落库、不进配置、不缓存；仅供组织树同步这类用户级接口使用。
     */
    public String userToken(String phone, String password) {
        if (properties.isMock()) return mockToken(false).getAccessToken();
        if (phone == null || phone.trim().isEmpty() || password == null || password.isEmpty()) {
            throw new IllegalStateException("请填写柳讯手机号和密码");
        }
        Map<String, String> cookies = new HashMap<>();
        try {
            String authorize = properties.getBaseUrl() + "/oauth/authorize?client_id=" + properties.getClientId()
                    + "&response_type=code&redirect_uri={redirect}";
            ResponseEntity<String> ar = template().exchange(authorize, HttpMethod.GET, null, String.class,
                    properties.getRedirectUri());
            collect(ar, cookies);
            // 必须先 GET 一次登录页建立完整 session，否则柳讯登录成功但响应里没有 redirectUrl
            HttpHeaders ph = new HttpHeaders();
            applyCookies(ph, cookies);
            ResponseEntity<String> page = template().exchange(properties.getBaseUrl() + "/login/custom",
                    HttpMethod.GET, new HttpEntity<>(ph), String.class);
            collect(page, cookies);

            String loginUrl = properties.getBaseUrl() + "/login/custom/form";
            Map<String, Object> loginBody = new LinkedHashMap<>();
            loginBody.put("username", phone.trim());
            loginBody.put("password", password);
            loginBody.put("remember", false);
            HttpHeaders lh = new HttpHeaders();
            lh.setContentType(MediaType.APPLICATION_JSON);
            applyCookies(lh, cookies);
            ResponseEntity<String> lr = template().exchange(loginUrl, HttpMethod.POST,
                    new HttpEntity<>(objectMapper.writeValueAsString(loginBody), lh), String.class);
            collect(lr, cookies);
            JsonNode lj = objectMapper.readTree(lr.getBody() == null ? "{}" : lr.getBody());
            // 只认 success；redirectUrl 有无都不影响——登录后重新访问 authorize 即可拿到授权码
            if (!lj.path("success").asBoolean(false)) {
                throw new IllegalStateException("柳讯账号登录失败：" + lr.getBody());
            }
            String redirectUrl = lj.path("redirectUrl").asText("");

            String target = redirectUrl.isEmpty() ? null
                    : (redirectUrl.startsWith("http") ? redirectUrl : properties.getBaseUrl() + redirectUrl);
            String code = null;
            for (int i = 0; i < 5 && code == null; i++) {
                HttpHeaders h = new HttpHeaders();
                applyCookies(h, cookies);
                ResponseEntity<String> rr;
                if (target == null) {
                    rr = template().exchange(authorize, HttpMethod.GET, new HttpEntity<>(h), String.class,
                            properties.getRedirectUri());
                } else {
                    rr = template().exchange(target, HttpMethod.GET, new HttpEntity<>(h), String.class);
                }
                collect(rr, cookies);
                java.net.URI loc = rr.getHeaders().getLocation();
                if (loc == null) break;
                String q = loc.getQuery();
                if (q != null && q.contains("code=")) {
                    for (String part : q.split("&")) {
                        if (part.startsWith("code=")) code = java.net.URLDecoder.decode(part.substring(5), "UTF-8");
                    }
                    break;
                }
                target = loc.isAbsolute() ? loc.toString() : properties.getBaseUrl() + loc.toString();
            }
            if (code == null) throw new IllegalStateException("柳讯授权码获取失败，请确认账号可用");
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("client_id", properties.getClientId());
            form.add("client_secret", properties.getClientSecret());
            form.add("grant_type", "authorization_code");
            form.add("redirect_uri", properties.getRedirectUri());
            form.add("code", code);
            return postForm("/oauth/token", form, LiuxunTokenResponse.class).getAccessToken();
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("柳讯用户 token 获取异常：" + e.getMessage(), e);
        }
    }

    private void applyCookies(HttpHeaders headers, Map<String, String> cookies) {
        if (cookies.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : cookies.entrySet()) {
            if (sb.length() > 0) sb.append("; ");
            sb.append(e.getKey()).append('=').append(e.getValue());
        }
        headers.add(HttpHeaders.COOKIE, sb.toString());
    }

    private void collect(ResponseEntity<?> response, Map<String, String> cookies) {
        java.util.List<String> values = response.getHeaders().get(HttpHeaders.SET_COOKIE);
        if (values == null) return;
        for (String value : values) {
            String kv = value.split(";", 2)[0];
            int i = kv.indexOf('=');
            if (i > 0) cookies.put(kv.substring(0, i), kv.substring(i + 1));
        }
    }

    /** 客户端模式 token（缓存到 expires_in 到期前 30 秒） */
    public LiuxunTokenResponse clientToken() {
        if (properties.isMock()) {
            return mockToken(false);
        }
        long now = System.currentTimeMillis();
        CachedToken cached = clientToken;
        if (cached != null && cached.expireAt > now + 30_000L) {
            return cached.token;
        }
        synchronized (this) {
            cached = clientToken;
            if (cached != null && cached.expireAt > now + 30_000L) {
                return cached.token;
            }
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("client_id", properties.getClientId());
            form.add("client_secret", properties.getClientSecret());
            form.add("grant_type", "client_credentials");
            LiuxunTokenResponse token = postForm("/oauth/token", form, LiuxunTokenResponse.class);
            long expireAt = now + Math.max(60L, token.getExpiresIn() - 30L) * 1000L;
            clientToken = new CachedToken(token, expireAt);
            return token;
        }
    }

    /**
     * 按手机号查柳讯用户。
     * 真实调用 GET {baseUrl}/api/user/query?userName=xxx，
     * 请求头 Authorization: Bearer {clientToken}。
     * 注意该接口要求 system scope，当前 client 未分配时会 403 insufficient_scope。
     */
    public LiuxunAccount queryUser(String phone) {
        if (properties.isMock()) {
            return mockAccount();
        }
        String token = clientToken().getAccessToken();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        try {
            ResponseEntity<String> response = template().exchange(
                    properties.getBaseUrl() + "/api/user/query?userName=" + phone,
                    HttpMethod.GET, new HttpEntity<>(headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            int code = root.path("code").asInt(-1);
            if (code != 0) {
                throw new IllegalStateException("柳讯查询用户失败 code=" + code + " body=" + response.getBody());
            }
            return LiuxunAccount.from(objectMapper.convertValue(root.get("result"), Map.class));
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯查询用户网络失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("柳讯查询用户响应解析失败: " + e.getMessage(), e);
        }
    }

    /** 生成授权页 URL，供前端「柳讯登录」入口跳转 */
    public String authorizeUrl() {
        if (properties.isMock()) {
            return "/oauth/entry?mock=1";
        }
        return properties.getBaseUrl() + "/oauth/authorize?client_id=" + properties.getClientId()
                + "&response_type=code&redirect_uri=" + urlEncode(properties.getRedirectUri());
    }

    private <T> T postForm(String path, MultiValueMap<String, String> form, Class<T> type) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        try {
            ResponseEntity<T> response = template().postForEntity(
                    properties.getBaseUrl() + path, new HttpEntity<>(form, headers), type);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new IllegalStateException("柳讯 token 接口异常 status=" + response.getStatusCode());
            }
            return response.getBody();
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯 token 接口网络失败: " + e.getMessage(), e);
        }
    }

    private RestTemplate template() {
        if (restTemplate == null) {
            synchronized (this) {
                if (restTemplate == null) {
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
                        @Override
                        protected void prepareConnection(java.net.HttpURLConnection connection, String httpMethod)
                                throws java.io.IOException {
                            super.prepareConnection(connection, httpMethod);
                            // 授权码流程必须自己处理 302 的 Location，不能被自动跟随
                            connection.setInstanceFollowRedirects(false);
                        }
                    };
                    factory.setConnectTimeout(properties.getConnectTimeout());
                    factory.setReadTimeout(properties.getReadTimeout());
                    restTemplate = new RestTemplate(factory);
                }
            }
        }
        return restTemplate;
    }

    private LiuxunTokenResponse mockToken(boolean withAccount) {
        LiuxunTokenResponse token = new LiuxunTokenResponse();
        token.setAccessToken("mock-liuxun-access-token");
        token.setTokenType("bearer");
        token.setExpiresIn(7199L);
        token.setScope("account contact retrieveMsg sendMsg system");
        token.setJti("mock-jti");
        if (withAccount) {
            token.setAccountInfo(mockAccount().toMap());
        }
        return token;
    }

    private LiuxunAccount mockAccount() {
        return new LiuxunAccount(properties.getMockUserId(), properties.getMockUserPhone(),
                properties.getMockUserName(), properties.getMockUserPhone(), "", "");
    }

    private static String urlEncode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (Exception e) {
            return value;
        }
    }

    private static class CachedToken {
        final LiuxunTokenResponse token;
        final long expireAt;

        CachedToken(LiuxunTokenResponse token, long expireAt) {
            this.token = token;
            this.expireAt = expireAt;
        }
    }

    /** 供诊断接口返回脱敏配置，不暴露 clientSecret */
    public Map<String, Object> publicConfig() {
        Map<String, Object> config = new HashMap<>();
        config.put("mock", properties.isMock());
        config.put("authorizeUrl", authorizeUrl());
        config.put("clientId", properties.getClientId());
        config.put("appId", properties.getAppId());
        config.put("redirectUri", properties.getRedirectUri());
        return config;
    }
}
