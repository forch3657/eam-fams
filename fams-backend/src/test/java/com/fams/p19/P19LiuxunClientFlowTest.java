package com.fams.p19;

import com.fams.module.liuxun.LiuxunOAuth2Client;
import com.fams.module.liuxun.LiuxunProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseCreator;
import org.springframework.web.client.RestTemplate;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/** 柳讯账号密码换 token 的真实 HTTP 流程测试（MockRestServiceServer 模拟柳讯，不出站）。 */
@SpringBootTest
@ActiveProfiles("test")
class P19LiuxunClientFlowTest {

    @Autowired private LiuxunOAuth2Client client;
    @Autowired private LiuxunProperties properties;

    private RestTemplate original;

    @AfterEach
    void restore() throws Exception {
        if (original != null) {
            Field f = LiuxunOAuth2Client.class.getDeclaredField("restTemplate");
            f.setAccessible(true);
            f.set(client, original);
        }
    }

    private ResponseCreator redirect(String location) {
        ResponseCreator base = withSuccess("", MediaType.TEXT_HTML);
        return (request) -> {
            org.springframework.http.client.ClientHttpResponse response = base.createResponse(request);
            response.getHeaders().set(HttpHeaders.LOCATION, location);
            return response;
        };
    }

    private void stub() throws Exception {
        Field f = LiuxunOAuth2Client.class.getDeclaredField("restTemplate");
        f.setAccessible(true);
        original = (RestTemplate) f.get(client);
        RestTemplate mockTemplate = new RestTemplate();
        f.set(client, mockTemplate);
        MockRestServiceServer server = MockRestServiceServer.createServer(mockTemplate);

        String base = properties.getBaseUrl();
        String cp = properties.getClientId();
        String ru = properties.getRedirectUri();

        server.expect(requestTo(base + "/oauth/authorize?client_id=" + cp
                        + "&response_type=code&redirect_uri=" + ru))
                .andRespond(redirect(base + "/login/custom"));
        server.expect(requestTo(base + "/login/custom/form"))
                .andRespond(withSuccess("{\"success\":true,\"redirectUrl\":\"/oauth/authorize?step=2\"}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(base + "/oauth/authorize?step=2"))
                .andRespond(redirect("http://192.168.60.66/oauth/callback?code=FAKE-CODE"));
        server.expect(requestTo(base + "/oauth/token"))
                .andRespond(withSuccess("{\"access_token\":\"USER-TOKEN\",\"token_type\":\"bearer\","
                        + "\"expires_in\":7199,\"scope\":\"contact\",\"jti\":\"x\"}",
                        MediaType.APPLICATION_JSON));
    }

    @Test
    @DisplayName("真实模式：手机号+密码走授权码流程换用户 token")
    void userTokenViaAuthCodeFlow() throws Exception {
        boolean originalMock = properties.isMock();
        try {
            properties.setMock(false);
            stub();
            assertThat(client.userToken("13900000001", "Pass@2026!ab")).isEqualTo("USER-TOKEN");

            assertThatThrownBy(() -> client.userToken("", ""))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("请填写柳讯手机号和密码");
        } finally {
            properties.setMock(originalMock);
        }
    }

    @Test
    @DisplayName("mock 模式：账号密码换 token 走本地桩")
    void userTokenInMock() {
        assertThat(properties.isMock()).isTrue();
        assertThat(client.userToken("13900000001", "Pass@2026!ab")).isNotBlank();
    }
}
