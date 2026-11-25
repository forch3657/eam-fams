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

        // 公司层级：示例研究院的上级应为示例集团；集团本级标记明确
        JsonNode companies = data.path("companies");
        String researchParent = "", groupParent = "";
        for (JsonNode c : companies) {
            if ("示例研究院（mock）".equals(c.path("name").asText())) researchParent = c.path("parentName").asText();
            if ("示例集团（mock）".equals(c.path("name").asText())) groupParent = c.path("parentName").asText();
        }
        assertThat(researchParent).isEqualTo("示例集团（mock）");
        assertThat(groupParent).isEqualTo("（集团本级）");

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
        int departmentsAfterFirst = genericService.listInternal("org-departments", Collections.emptyMap()).size();
        int positionsAfterFirst = genericService.listInternal("org-user-positions", Collections.emptyMap()).size();

        Map<String, String[]> query = new HashMap<>();
        query.put("username", new String[]{"13900003002"});
        List<Map<String, Object>> users = genericService.listInternal("org-users", query);
        assertThat(users).hasSize(1);
        assertThat(str(users.get(0).get("status"))).isEqualTo("ENABLED");
        assertThat(str(users.get(0).get("roleIds"))).contains("[]");
        assertThat(str(users.get(0).get("phone"))).isEqualTo("13900003002");

        // 公司层级写入：示例研究院的 parentId 必须指向示例集团，不能平铺
        Map<String, String[]> cq = new HashMap<>();
        cq.put("name", new String[]{"示例研究院（mock）"});
        List<Map<String, Object>> research = genericService.listInternal("org-companies", cq);
        assertThat(research).hasSize(1);
        String researchParentId = str(research.get(0).get("parentId"));
        assertThat(researchParentId).as("子公司必须挂到集团下").isNotBlank();
        assertThat(str(genericService.get("org-companies", researchParentId).get("name"))).isEqualTo("示例集团（mock）");

        JsonNode second = call("/api/liuxun-sync/apply").path("data");
        assertThat(second.path("ok").asBoolean()).isTrue();
        assertThat(second.path("createdUsers").asInt()).isEqualTo(0);
        assertThat(second.path("skippedExistingUsers").asInt()).isEqualTo(2);
        // 回归：重复 apply 不得重建部门（公司名||部门名 口径的幂等判断）
        assertThat(second.path("createdDepartments").asInt()).as("重复执行不得重建部门").isEqualTo(0);
        assertThat(genericService.listInternal("org-departments", Collections.emptyMap()).size())
                .as("部门总数不应因重复预置增加").isEqualTo(departmentsAfterFirst);
        assertThat(genericService.listInternal("org-user-positions", Collections.emptyMap()).size())
                .as("岗位总数不应因重复预置增加（兼职副本）").isEqualTo(positionsAfterFirst);

        // 预览也不得再把这些部门误报为待建
        JsonNode preview = call("/api/liuxun-sync/preview").path("data");
        assertThat(preview.path("stats").path("createDepartments").asInt()).as("预览不应误报部门待建").isEqualTo(0);
    }

    @Test
    @DisplayName("只预置组织：走现成导入服务，多级层级正确、重复执行不产生重复公司/部门、不建用户")
    void applyOrganizationsOnlyIsIdempotentAndNoUsers() throws Exception {
        JsonNode first = call("/api/liuxun-sync/apply-organizations").path("data");
        assertThat(first.path("ok").asBoolean()).as(first.path("failures").toString()).isTrue();
        assertThat(first.path("createdCompanies").asInt() + first.path("reusedCompanies").asInt())
                .isGreaterThanOrEqualTo(2);
        assertThat(first.path("createdDepartments").asInt() + first.path("reusedDepartments").asInt())
                .isGreaterThanOrEqualTo(2);
        assertThat(first.path("createdUsers").asInt()).isEqualTo(0);
        assertThat(first.path("createdPositions").asInt()).isEqualTo(0);

        // 层级：示例研究院的上级为示例集团（mock 树为 集团→研究院→两个部门）
        Map<String, String[]> q = new HashMap<>();
        q.put("name", new String[]{"示例研究院（mock）"});
        List<Map<String, Object>> subs = genericService.listInternal("org-companies", q);
        assertThat(subs).hasSize(1);
        // 若该公司由本组织导入路径创建（GS- 前缀），必须带上 parentId；
        // 若由前序全量预置测试创建（LX- 前缀），复用不覆盖属预期行为，不校验层级。
        if (str(subs.get(0).get("code")).startsWith("GS-")) {
            assertThat(str(subs.get(0).get("parentId"))).isNotBlank();
            assertThat(str(subs.get(0).get("parentId"))).isNotEqualTo("0");
        }

        // 再跑一次：全部复用，不新建
        JsonNode second = call("/api/liuxun-sync/apply-organizations").path("data");
        assertThat(second.path("ok").asBoolean()).as(second.path("failures").toString()).isTrue();
        assertThat(second.path("createdCompanies").asInt()).as("重复执行不应新建公司").isEqualTo(0);
        assertThat(second.path("createdDepartments").asInt()).as("重复执行不应新建部门").isEqualTo(0);
        assertThat(second.path("reusedCompanies").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(second.path("reusedDepartments").asInt()).isGreaterThanOrEqualTo(2);
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
        mockMvc.perform(post("/api/liuxun-sync/disable-by-company").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/liuxun-sync/assign-roles-by-company").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/liuxun-sync/apply-organizations").contentType(MediaType.APPLICATION_JSON).content("{}"))
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

    @Test
    @DisplayName("按公司批量停用：启用账号被停用，系统管理员R1跳过")
    void disableByCompany() throws Exception {
        Map<String, Object> company = new HashMap<>();
        company.put("name", "PU19-批量停用测试公司");
        company.put("code", "PU19-DISABLE");
        company.put("status", "ENABLED");
        Map<String, Object> savedCompany = genericService.create("org-companies", company);

        Map<String, Object> normal = new HashMap<>();
        normal.put("username", "pu19_disable_normal");
        normal.put("password", "Pu19@2026!ok");
        normal.put("name", "停用普通用户");
        normal.put("companyId", String.valueOf(savedCompany.get("id")));
        normal.put("status", "ENABLED");
        Map<String, Object> savedNormal = genericService.create("org-users", normal);

        Map<String, Object> admin = new HashMap<>();
        admin.put("username", "pu19_disable_admin");
        admin.put("password", "Pu19@2026!ok");
        admin.put("name", "停用管理员测试");
        admin.put("companyId", String.valueOf(savedCompany.get("id")));
        admin.put("status", "ENABLED");
        admin.put("roleIds", "[\"R1\"]");
        Map<String, Object> savedAdmin = genericService.create("org-users", admin);

        Map<String, Object> body = new HashMap<>();
        body.put("companyId", String.valueOf(savedCompany.get("id")));
        String response = mockMvc.perform(post("/api/liuxun-sync/disable-by-company")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode result = objectMapper.readTree(response).path("data");
        assertThat(result.path("disabled").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(result.path("skippedAdmin").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(str(genericService.get("org-users", str(savedNormal.get("id"))).get("status"))).isEqualTo("DISABLED");
        assertThat(str(genericService.get("org-users", str(savedAdmin.get("id"))).get("status"))).isEqualTo("ENABLED");
    }

    @Test
    @DisplayName("按公司批量预置角色：用户主表与岗位都写R3，空岗位也写，管理员跳过")
    void assignRolesByCompany() throws Exception {
        Map<String, Object> company = new HashMap<>();
        company.put("name", "PU19-预置角色测试公司");
        company.put("code", "PU19-ROLE");
        company.put("status", "ENABLED");
        Map<String, Object> savedCompany = genericService.create("org-companies", company);
        String companyId = String.valueOf(savedCompany.get("id"));

        Map<String, Object> user = new HashMap<>();
        user.put("username", "pu19_role_user");
        user.put("password", "Pu19@2026!ok");
        user.put("name", "角色预置用户");
        user.put("companyId", companyId);
        user.put("status", "ENABLED");
        Map<String, Object> savedUser = genericService.create("org-users", user);
        String userId = String.valueOf(savedUser.get("id"));

        Map<String, Object> pos = new HashMap<>();
        pos.put("userId", userId);
        pos.put("companyId", companyId);
        pos.put("position", "职员");
        pos.put("isPrimary", true);
        pos.put("status", "ENABLED");
        genericService.create("org-user-positions", pos);
        Map<String, Object> emptyPos = new HashMap<>();
        emptyPos.put("userId", userId);
        emptyPos.put("companyId", companyId);
        emptyPos.put("status", "ENABLED");
        Map<String, Object> savedEmpty = genericService.create("org-user-positions", emptyPos);

        Map<String, Object> body = new HashMap<>();
        body.put("companyId", companyId);
        String response = mockMvc.perform(post("/api/liuxun-sync/assign-roles-by-company")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode result = objectMapper.readTree(response).path("data");
        assertThat(result.path("usersUpdated").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(result.path("positionsUpdated").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(str(genericService.get("org-users", userId).get("roleIds"))).contains("R3");
        assertThat(str(genericService.get("org-user-positions", str(savedEmpty.get("id"))).get("roleIds")))
                .as("空岗位也必须预置 R3").contains("R3");

        // 重复执行：全部跳过
        JsonNode second = callWithBody("/api/liuxun-sync/assign-roles-by-company", body);
        assertThat(second.path("data").path("usersUpdated").asInt()).isEqualTo(0);
        assertThat(second.path("data").path("positionsUpdated").asInt()).isEqualTo(0);
    }

    private JsonNode call(String path) throws Exception {
        return callWithBody(path, new HashMap<>());
    }

    private JsonNode callWithBody(String path, Object body) throws Exception {
        String response = mockMvc.perform(post(path)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }
}
