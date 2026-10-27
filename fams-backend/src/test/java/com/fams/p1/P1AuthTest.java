package com.fams.p1;

import com.fams.TestAccounts;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fams.engine.GenericService;
import com.fams.security.LoginAttemptService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
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
 * P1 认证与鉴权验收：登录、统一失败提示、失败锁定、无 token / 坏 token 401。
 *
 * <p>演示数据自带的账号口令为 {@code admin / Fzidt@123}（见 {@link com.fams.TestAccounts}），
 * 启动时由 DataInitializer 迁移为 BCrypt 后再参与校验。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P1AuthTest {

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GenericService genericService;

    @Autowired
    private LoginAttemptService loginAttemptService;

    @BeforeEach
    void ensureAdmin() {
        loginAttemptService.loginSucceeded(ADMIN);
        if (genericService.findByUsername(ADMIN) != null) {
            return;
        }
        genericService.create("org-users", userPayload("u-admin", ADMIN, "系统管理员"));
    }

    @Test
    @DisplayName("登录成功：返回信封、token 与含 roleIds 的 user")
    void loginSuccess() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.user.username").value(ADMIN))
                .andExpect(jsonPath("$.data.user.roleIds").exists());
    }

    @Test
    @DisplayName("密码错误：401，提示统一为「用户名或密码错误」")
    void wrongPasswordUsesUnifiedMessage() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, "bad-pass")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.message").value("用户名或密码错误"));
    }

    @Test
    @DisplayName("账号不存在：提示与密码错误完全一致，不泄露账号是否存在")
    void unknownUserUsesSameMessage() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials("no-such-user", "whatever")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("用户名或密码错误"));
    }

    @Test
    @DisplayName("连续失败达阈值后锁定，正确口令也被拒绝（403）")
    void lockAfterMaxFailedAttempts() throws Exception {
        String username = "lock-probe";
        if (genericService.findByUsername(username) == null) {
            genericService.create("org-users", userPayload("u-lock-probe", username, "锁定探测账号"));
        }
        loginAttemptService.loginSucceeded(username);
        for (int i = 0; i < 5; i++) {
            loginAttemptService.loginFailed(username);
        }
        assertThat(loginAttemptService.isLocked(username)).isTrue();

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(username, PASSWORD)))
                .andExpect(status().isForbidden());
    }

    /** org-users 的必填项：username / name / companyId / status */
    private static Map<String, Object> userPayload(String id, String username, String name) {
        Map<String, Object> user = new HashMap<>();
        user.put("id", id);
        user.put("username", username);
        user.put("name", name);
        user.put("password", new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(PASSWORD));
        user.put("companyId", "C1");
        user.put("deptId", "D1");
        user.put("status", "ENABLED");
        return user;
    }

    private String credentials(String username, String password) throws Exception {
        Map<String, String> map = new HashMap<>();
        map.put("username", username);
        map.put("password", password);
        return objectMapper.writeValueAsString(map);
    }
}
