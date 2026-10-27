package com.fams.p7;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.security.LoginAttemptService;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P7 口令安全回归测试：守卫「用户口令不得明文落库、不得对外回传」这条底线。
 *
 * <p>这些用例专门针对曾经真实发生过的两类缺陷而设，防止再次回归：
 * <ul>
 *   <li><b>明文落库</b>：通用引擎 create 对 org-users 直接落库，未走 BCrypt；
 *       前端还默认填 123456。守卫方式：断言存储值是 BCrypt 形态且不等于明文。</li>
 *   <li><b>脱敏误伤口令迁移</b>：对外响应剔除 password 后，DataInitializer 靠 list() 读口令
 *       迁移逻辑被饿死（读到的永远为空），导致全新部署口令保持明文且无法登录。
 *       守卫方式：断言种子账号在启动后已是 BCrypt 形态。</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P7PasswordSecurityTest {

    private static final String USERS = "org-users";

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    private static final String STRONG = "Test@1234";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GenericService genericService;

    @Autowired
    private LoginAttemptService loginAttemptService;

    private final List<String> createdIds = new ArrayList<>();

    private String token;

    @BeforeEach
    void loginAsAdmin() throws Exception {
        loginAttemptService.loginSucceeded(ADMIN);
        if (token != null) {
            return;
        }
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(body).path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    @AfterEach
    void cleanup() {
        for (String id : createdIds) {
            try {
                mockMvc.perform(auth(delete("/api/" + USERS + "/" + id)));
            } catch (RuntimeException ignored) {
                // 清理失败不影响断言结论
            } catch (Exception ignored) {
                // 清理失败不影响断言结论
            }
        }
        createdIds.clear();
    }

    @Test
    @DisplayName("回归：种子明文口令启动时已迁移为 BCrypt（脱敏曾导致迁移被整体跳过）")
    void seededPasswordsAreMigratedToBcrypt() {
        Map<String, Object> adminRow = genericService.findByUsername(ADMIN);
        assertThat(adminRow).isNotNull();
        String stored = String.valueOf(adminRow.get("password"));
        assertThat(stored).startsWith("$2");
        assertThat(stored).isNotEqualTo(PASSWORD);
        assertThat(new BCryptPasswordEncoder().matches(PASSWORD, stored)).isTrue();
    }

    @Test
    @DisplayName("新增用户：口令以 BCrypt 落库，且该口令可正常登录")
    void newUserPasswordIsStoredAsBcrypt() throws Exception {
        String username = unique("p7_new");
        createUser(username, STRONG);

        String stored = String.valueOf(genericService.findByUsername(username).get("password"));
        assertThat(stored).startsWith("$2");
        assertThat(stored).isNotEqualTo(STRONG);
        assertThat(new BCryptPasswordEncoder().matches(STRONG, stored)).isTrue();

        assertThat(loginAs(username, STRONG)).isTrue();
    }

    @Test
    @DisplayName("空口令新增用户：被拒绝，并明确提示需设置密码")
    void emptyPasswordIsRejected() throws Exception {
        mockMvc.perform(auth(post("/api/" + USERS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(userPayload(unique("p7_empty"), ""))))
                .andExpect(jsonPath("$.code").value(422))
                .andExpect(jsonPath("$.message").value(containsString("请设置密码")));
    }

    @Test
    @DisplayName("弱口令新增用户：被口令策略拒绝，不让其在库里裸奔")
    void weakPasswordIsRejected() throws Exception {
        mockMvc.perform(auth(post("/api/" + USERS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(userPayload(unique("p7_weak"), "123"))))
                .andExpect(jsonPath("$.code").value(422));
    }

    @Test
    @DisplayName("对外接口绝不回传 password：列表、详情、新增响应均无该字段")
    void apiResponsesNeverExposePassword() throws Exception {
        String username = unique("p7_leak");
        JsonNode created = createUser(username, STRONG);
        String id = created.path("id").asText();

        mockMvc.perform(auth(get("/api/" + USERS).param("pageSize", "5")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].password").doesNotExist());

        mockMvc.perform(auth(get("/api/" + USERS + "/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.password").doesNotExist());
    }

    @Test
    @DisplayName("幂等：提交已哈希的口令不会被二次加密（仍可用原明文登录）")
    void alreadyHashedPasswordIsNotRehashed() throws Exception {
        String username = unique("p7_hash");
        String raw = "Secret@123";
        String bcrypt = new BCryptPasswordEncoder().encode(raw);

        createUser(username, bcrypt);
        assertThat(loginAs(username, raw)).isTrue();
        assertThat(new BCryptPasswordEncoder().matches(raw,
                String.valueOf(genericService.findByUsername(username).get("password")))).isTrue();
    }

    @Test
    @DisplayName("编辑不填口令：保留原口令，既不覆盖也不清空")
    void updateWithoutPasswordKeepsOriginal() throws Exception {
        String username = unique("p7_edit");
        JsonNode created = createUser(username, STRONG);
        String id = created.path("id").asText();

        Map<String, Object> update = userPayload(username, "");
        update.put("version", created.path("version").asInt());
        mockMvc.perform(auth(put("/api/" + USERS + "/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk());

        assertThat(loginAs(username, STRONG)).isTrue();
    }

    @Test
    @DisplayName("认证链路未被脱敏破坏：管理员仍可用种子口令登录")
    void adminCanStillLogin() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.token").isNotEmpty());
    }

    // ------------------------------------------------------------------ 辅助

    private JsonNode createUser(String username, String password) throws Exception {
        String body = mockMvc.perform(auth(post("/api/" + USERS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(userPayload(username, password))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).path("data");
        createdIds.add(data.path("id").asText());
        return data;
    }

    private boolean loginAs(String username, String rawPassword) throws Exception {
        loginAttemptService.loginSucceeded(username);
        return mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(username, rawPassword)))
                .andReturn().getResponse().getStatus() == 200;
    }

    private Map<String, Object> userPayload(String username, String password) {
        Map<String, Object> user = new HashMap<>();
        user.put("username", username);
        user.put("name", "口令回归测试");
        user.put("companyId", "C1");
        user.put("deptId", "D1");
        user.put("roleIds", Arrays.asList("R2"));
        user.put("status", "ENABLED");
        user.put("password", password);
        return user;
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder builder) {
        return builder.header("Authorization", "Bearer " + token);
    }

    private String credentials(String username, String password) throws Exception {
        Map<String, String> map = new HashMap<>();
        map.put("username", username);
        map.put("password", password);
        return objectMapper.writeValueAsString(map);
    }

    private String unique(String prefix) {
        return prefix + "_" + System.currentTimeMillis() + "_" + (int) (Math.random() * 1000);
    }
}
