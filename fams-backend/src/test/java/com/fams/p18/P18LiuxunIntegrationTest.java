package com.fams.p18;

import com.fams.engine.GenericService;
import com.fams.module.liuxun.LiuxunProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 柳讯对接 mock 模式回归：免登（仅映射既有账号）、待办 CRUD 数据结构。
 * 全程不访问柳讯（test profile 固定 fams.liuxun.mock=true）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P18LiuxunIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private LiuxunProperties liuxunProperties;
    @Autowired
    private GenericService genericService;

    /** 禁止自动建号后，mock 账号必须先在库里预置才能登录 */
    @BeforeEach
    void presetMockUser() {
        String phone = liuxunProperties.getMockUserPhone();
        if (genericService.findByUsername(phone) == null) {
            Map<String, Object> user = new HashMap<>();
            user.put("id", "u-liuxun-mock");
            user.put("username", phone);
            user.put("name", "柳讯测试用户");
            user.put("password", new BCryptPasswordEncoder().encode("P@ssw0rd"));
            user.put("companyId", "C1");
            user.put("deptId", "D1");
            user.put("roleIds", new String[]{"R3"});
            user.put("status", "ENABLED");
            genericService.create("org-users", user);
        }
    }

    @Test
    @DisplayName("配置下发：mock 模式且不暴露 clientSecret")
    void configIsPublicSafe() throws Exception {
        String body = mockMvc.perform(get("/api/auth/liuxun/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString();
        JsonNode data = objectMapper.readTree(body).get("data");
        assertThat(data.get("mock").asBoolean()).isTrue();
        assertThat(data.has("clientSecret")).isFalse();
        assertThat(data.get("redirectUri").asText()).isEqualTo("http://192.168.60.66/oauth/callback");
    }

    @Test
    @DisplayName("既有账号：授权码换 token 签发本地 JWT，不建新号")
    void exchangeCodeSignsLocalJwtForPresetUser() throws Exception {
        String body = mockMvc.perform(post("/api/auth/liuxun/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"mock-code\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString();
        JsonNode data = objectMapper.readTree(body).get("data");
        String token = data.get("token").asText();
        assertThat(token).isNotBlank();
        assertThat(data.get("user").get("username").asText()).isEqualTo("13625070487");
        assertThat(data.get("user").has("password")).isFalse();

        // 用签发的 JWT 访问受保护端点，证明 token 真实有效
        mockMvc.perform(get("/api/auth/profile").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
    }

    @Test
    @DisplayName("未预置账号：授权码换 token 被拒绝，提示联系管理员（不自动建号）")
    void unknownUserRejectedNoAutoCreate() throws Exception {
        String original = liuxunProperties.getMockUserPhone();
        String unknown = "19900000000";
        liuxunProperties.setMockUserPhone(unknown);
        try {
            assertThat(genericService.findByUsername(unknown)).isNull();
            String body = mockMvc.perform(post("/api/auth/liuxun/token")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"code\":\"mock-code\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(401))
                    .andReturn().getResponse().getContentAsString();
            JsonNode root = objectMapper.readTree(body);
            assertThat(root.get("message").asText()).contains("管理员");
            // 关键断言：被拒绝后仍未创建本地账号
            assertThat(genericService.findByUsername(unknown)).isNull();
        } finally {
            liuxunProperties.setMockUserPhone(original);
        }
    }

    @Test
    @DisplayName("空授权码返回 400")
    void emptyCodeRejected() throws Exception {
        mockMvc.perform(post("/api/auth/liuxun/token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    @DisplayName("mock 自检：既有账号 + 待办创建/完成/删除全链路")
    void mockSelfTest() throws Exception {
        String body = mockMvc.perform(post("/api/auth/liuxun/mock-selftest")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString();
        JsonNode data = objectMapper.readTree(body).get("data");
        assertThat(data.get("ok").asBoolean()).isTrue();
        assertThat(data.get("username").asText()).isEqualTo("13625070487");
        assertThat(data.get("todoId").asLong()).isGreaterThan(0L);
    }

    @Test
    @DisplayName("非 mock 模式下自检接口拒绝")
    void selfTestRejectedWhenRealMode() throws Exception {
        liuxunProperties.setMock(false);
        try {
            mockMvc.perform(post("/api/auth/liuxun/mock-selftest")
                            .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.code").value(400));
        } finally {
            liuxunProperties.setMock(true);
        }
    }
}
