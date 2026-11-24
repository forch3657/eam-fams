package com.fams.p19;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fams.engine.GenericService;
import com.fams.security.LoginAttemptService;
import com.fams.TestAccounts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 柳讯通讯录批量预置 / 按公司批量启用（mock 模式，全程不出站）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P19LiuxunSyncTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private GenericService genericService;
    @Autowired private LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
        loginAttemptService.loginSucceeded(TestAccounts.ADMIN);
        Map<String, String> body = new HashMap<>();
        body.put("username", TestAccounts.ADMIN);
        body.put("password", TestAccounts.PASSWORD);
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(response).path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    @Test
    @DisplayName("预览：mock 通讯录解析为 2 公司 / 2 部门 / 3 人员节点，去重后 2 人")
    void previewParsesTreeAndDedupsByPhone() throws Exception {
        JsonNode data = call("/api/liuxun-sync/preview").path("data");
        assertThat(data.path("mock").asBoolean()).isTrue();
        JsonNode stats = data.path("stats");
        assertThat(stats.path("companyNodes").asInt()).isEqualTo(2);
        assertThat(stats.path("deptNodes").asInt()).isEqualTo(2);
        assertThat(stats.path("peopleNodes").asInt()).isEqualTo(3);
        assertThat(stats.path("uniquePeople").asInt()).isEqualTo(2);

        // 李四同一手机号两条岗位记录：一条主职、一条兼职
        JsonNode positions = data.path("positions");
        int partTime = 0, primary = 0;
        for (JsonNode p : positions) {
            if (p.path("primary").asBoolean()) primary++;
            else partTime++;
        }
        assertThat(primary).isEqualTo(2);
        assertThat(partTime).isEqualTo(1);
    }

    @Test
    @DisplayName("预置：建档案、默认启用、不赋角色；重复执行幂等跳过")
    void applyCreatesUsersEnabledAndIsIdempotent() throws Exception {
        JsonNode first = call("/api/liuxun-sync/apply").path("data");
        assertThat(first.path("ok").asBoolean()).as(first.path("errors").toString()).isTrue();
        assertThat(first.path("createdUsers").asInt()).isEqualTo(2);
        assertThat(first.path("createdPositions").asInt()).isEqualTo(3);

        Map<String, String[]> query = new HashMap<>();
        query.put("username", new String[]{"13900003002"});
        List<Map<String, Object>> users = genericService.listInternal("org-users", query);
        assertThat(users).hasSize(1);
        assertThat(str(users.get(0).get("status"))).isEqualTo("ENABLED");
        assertThat(str(users.get(0).get("roleIds"))).contains("[]");
        assertThat(str(users.get(0).get("phone"))).isEqualTo("13900003002");

        JsonNode second = call("/api/liuxun-sync/apply").path("data");
        assertThat(second.path("ok").asBoolean()).isTrue();
        assertThat(second.path("createdUsers").asInt()).isEqualTo(0);
        assertThat(second.path("skippedExistingUsers").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("预览 / 预置 / 批量启用要求登录态")
    void endpointsRequireAuth() throws Exception {
        mockMvc.perform(post("/api/liuxun-sync/preview").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/liuxun-sync/apply").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/liuxun-sync/enable-by-company").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("按公司批量启用：停用账号被启用，已启用账号跳过")
    void enableByCompany() throws Exception {
        Map<String, Object> company = new HashMap<>();
        company.put("name", "PU19-批量启用测试公司");
        company.put("code", "PU19-ENABLE");
        company.put("status", "ENABLED");
        Map<String, Object> savedCompany = genericService.create("org-companies", company);

        Map<String, Object> disabled = new HashMap<>();
        disabled.put("username", "pu19_disabled_user");
        disabled.put("password", "Pu19@2026!ok");
        disabled.put("name", "停用测试用户");
        disabled.put("companyId", String.valueOf(savedCompany.get("id")));
        disabled.put("status", "DISABLED");
        Map<String, Object> savedUser = genericService.create("org-users", disabled);

        Map<String, Object> body = new HashMap<>();
        body.put("companyId", String.valueOf(savedCompany.get("id")));
        String response = mockMvc.perform(post("/api/liuxun-sync/enable-by-company")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode result = objectMapper.readTree(response).path("data");
        assertThat(result.path("enabled").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(str(genericService.get("org-users", str(savedUser.get("id"))).get("status"))).isEqualTo("ENABLED");
    }

    private JsonNode call(String path) throws Exception {
        String response = mockMvc.perform(post(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
