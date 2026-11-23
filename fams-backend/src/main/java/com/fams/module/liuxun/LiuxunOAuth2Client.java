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
                    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
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
