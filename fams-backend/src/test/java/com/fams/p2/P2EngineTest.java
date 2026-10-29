package com.fams.p2;

import com.fams.TestAccounts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P2 通用引擎 + 组织架构验收：8 个端点的行为与契约一致。
 *
 * <p>演示账号为 {@code admin / Fzidt@123}（见 {@link com.fams.TestAccounts}），
 * 登录后携带 Bearer token 访问业务接口。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P2EngineTest {

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private com.fams.security.LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
        // 上下文在多个测试类间复用，清除上一轮失败累计的锁定计数
        loginAttemptService.loginSucceeded(ADMIN);
        if (token != null) {
            return;
        }
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(response).path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    @Test
    @DisplayName("列表接口返回数组")
    void listReturnsArray() throws Exception {
        mockMvc.perform(auth(get("/api/org-companies")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(greaterThan(0)));
    }

    @Test
    @DisplayName("分页接口返回 { rows, total, page, pageSize }")
    void pageReturnsEnvelope() throws Exception {
        mockMvc.perform(auth(get("/api/org-users/page")
                        .param("page", "1")
                        .param("pageSize", "5")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rows").isArray())
                .andExpect(jsonPath("$.data.rows.length()").value(lessThanOrEqualTo(5)))
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.pageSize").value(5))
                .andExpect(jsonPath("$.data.total").value(greaterThan(0)));
    }

    @Test
    @DisplayName("keyword 与字段过滤生效")
    void keywordAndFiltersWork() throws Exception {
        String response = mockMvc.perform(auth(get("/api/org-users/page")
                        .param("keyword", "zhangwei")
                        .param("pageSize", "20")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(response).path("data").path("rows");
        assertThat(rows.size()).isGreaterThan(0);
        for (JsonNode row : rows) {
            assertThat(row.path("username").asText() + row.path("name").asText() + row.path("phone").asText())
                    .containsIgnoringCase("zhangwei");
        }
    }

    @Test
    @DisplayName("详情接口按主键返回单行；不存在返回 404")
    void detailReturnsRow() throws Exception {
        mockMvc.perform(auth(get("/api/org-companies/not-exist-id")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404));
    }

    @Test
    @DisplayName("新增返回含服务端生成主键的行，并写入审计字段 version=1")
    void createReturnsRowWithAudit() throws Exception {
        Map<String, Object> company = new HashMap<>();
        company.put("code", "C-TEST-01");
        company.put("name", "测试公司");
        company.put("status", "ENABLED");
        company.put("sort", 99);

        String response = mockMvc.perform(auth(post("/api/org-companies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(company))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.createTime").exists())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        String id = objectMapper.readTree(response).path("data").path("id").asText();

        mockMvc.perform(auth(get("/api/org-companies/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("C-TEST-01"));

        mockMvc.perform(auth(delete("/api/org-companies/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
    }

    @Test
    @DisplayName("更新：PUT 为全量替换，缺失字段被清空")
    void updateReplacesWholeRow() throws Exception {
        String id = createCompany("C-PUT-01", "待更新公司");

        Map<String, Object> replacement = new HashMap<>();
        replacement.put("code", "C-PUT-01");
        replacement.put("name", "更新后公司");
        replacement.put("status", "ENABLED");

        mockMvc.perform(auth(put("/api/org-companies/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(replacement))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("更新后公司"))
                .andExpect(jsonPath("$.data.version").value(2));

        mockMvc.perform(auth(get("/api/org-companies/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.contact").doesNotExist());

        mockMvc.perform(auth(delete("/api/org-companies/" + id)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("乐观锁：版本落后返回 409，且提示含当前版本与基于版本")
    void staleVersionReturns409() throws Exception {
        String id = createCompany("C-VER-01", "版本测试公司");

        Map<String, Object> first = new HashMap<>();
        first.put("code", "C-VER-01");
        first.put("name", "第一次更新");
        first.put("status", "ENABLED");
        first.put("version", 1);
        mockMvc.perform(auth(put("/api/org-companies/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(first))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(2));

        Map<String, Object> stale = new HashMap<>();
        stale.put("code", "C-VER-01");
        stale.put("name", "基于旧版本的更新");
        stale.put("status", "ENABLED");
        stale.put("version", 1);

        String response = mockMvc.perform(auth(put("/api/org-companies/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(stale))))
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(409);
        assertThat(node.path("message").asText()).contains("当前版本 2").contains("你基于版本 1");

        mockMvc.perform(auth(delete("/api/org-companies/" + id)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("唯一性冲突返回 409")
    void duplicateReturns409() throws Exception {
        String id = createCompany("C-DUP-01", "重复测试公司");

        Map<String, Object> again = new HashMap<>();
        again.put("code", "C-DUP-01");
        again.put("name", "另一家公司");
        again.put("status", "ENABLED");

        String response = mockMvc.perform(auth(post("/api/org-companies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(again))))
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(409);
        assertThat(node.path("message").asText()).contains("C-DUP-01");

        mockMvc.perform(auth(delete("/api/org-companies/" + id)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("外键不存在返回 1005")
    void missingRefReturns1005() throws Exception {
        Map<String, Object> dept = new HashMap<>();
        dept.put("code", "D-NO-COMPANY");
        dept.put("name", "无归属部门");
        dept.put("companyId", "company-does-not-exist");
        dept.put("status", "ENABLED");

        String response = mockMvc.perform(auth(post("/api/org-departments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(dept))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1005);
        assertThat(node.path("message").asText()).contains("companyId");
    }

    @Test
    @DisplayName("枚举取值非法返回 422 且 details 含字段级错误")
    void invalidEnumReturns422() throws Exception {
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", "A-BAD-ENUM");
        asset.put("name", "错误枚举资产");
        asset.put("category", "NOT_A_CATEGORY");
        asset.put("status", "NOT_A_STATUS");

        String response = mockMvc.perform(auth(post("/api/fixed-assets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(asset))))
                .andExpect(status().isUnprocessableEntity())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(422);
        assertThat(node.path("details").isArray()).isTrue();
        assertThat(node.path("details").size()).isGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("删除保护：部门下仍有子部门/人员时返回 1002")
    void deleteProtectionBlocksUsedDepartment() throws Exception {
        String response = mockMvc.perform(auth(delete("/api/org-departments/D1")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1002);
        assertThat(node.path("message").asText()).contains("子部门");
    }

    @Test
    @DisplayName("批量更新：PUT /{key}/batch 按主键 upsert 并返回保存后的行")
    void batchUpdateReturnsAffectedCount() throws Exception {
        String first = createCompany("C-BATCH-01", "批量一");
        String second = createCompany("C-BATCH-02", "批量二");

        Map<String, Object> row1 = companyPayload("C-BATCH-01", "批量一改");
        row1.put("id", first);
        Map<String, Object> row2 = companyPayload("C-BATCH-02", "批量二改");
        row2.put("id", second);

        mockMvc.perform(auth(put("/api/org-companies/batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Arrays.asList(row1, row2)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2));

        mockMvc.perform(auth(get("/api/org-companies/" + first)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name").value("批量一改"));

        mockMvc.perform(auth(delete("/api/org-companies/" + first))).andExpect(status().isOk());
        mockMvc.perform(auth(delete("/api/org-companies/" + second))).andExpect(status().isOk());
    }

    @Autowired
    private com.fams.engine.PermissionPolicy permissionPolicy;

    /**
     * 折旧配置的读权限必须低于写权限：只持有 fa:view 的普通角色（资产使用人/仓管员）
     * 也要能读到折旧方案，否则前端折旧台账匹配不到方案、整页显示「未配置」。
     */
    @Test
    @DisplayName("折旧配置：fa:view 可读，写删与计提仍要求 fa:depreciation")
    void depreciationConfigReadableWithViewPermissionOnly() {
        // 项目以 Java 8 编译，Set.of 不可用
        Set<String> viewer = new HashSet<>(Collections.singletonList("fa:view"));
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-schemes", "GET", viewer)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-settings-depreciation-plans", "GET", viewer)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-settings-depreciation-rules", "GET", viewer)).isTrue();

        // 增删改方案仍需 fa:depreciation（写表未登记精确 key，走 fixed-asset-depreciation 前缀）
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-schemes", "POST", viewer)).isFalse();
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-schemes", "PUT", viewer)).isFalse();
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-schemes", "DELETE", viewer)).isFalse();

        // 计提/报表属于执行动作，不放宽
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-reports", "GET", viewer)).isFalse();

        // 资产管理员（含 fa:depreciation）仍可写，管理员行为不变
        Set<String> assetAdmin = new HashSet<>(Arrays.asList("fa:view", "fa:depreciation", "fa:edit"));
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-schemes", "POST", assetAdmin)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-depreciation-reports", "GET", assetAdmin)).isTrue();
    }

    /**
     * 基础配置使用独立权限码：只有台账查看/编辑权限的账号不能进基础设置；
     * 但低值位置与折旧方案/规则的「读」必须保留给 lv:view / fa:view，
     * 否则业务表单下拉与折旧台账计算会失效。
     */
    @Test
    @DisplayName("基础配置：fa:settings / lv:settings 独立授权，读保留业务口径")
    void baseSettingsRequireDedicatedPermission() {
        Set<String> assetEditor = new HashSet<>(Arrays.asList("fa:view", "fa:edit", "lv:view", "lv:edit"));
        assertThat(permissionPolicy.matches("fixed-asset-settings-locations", "GET", assetEditor)).isFalse();
        assertThat(permissionPolicy.matches("fixed-asset-settings-locations", "POST", assetEditor)).isFalse();
        assertThat(permissionPolicy.matches("fixed-asset-settings-categories", "GET", assetEditor)).isFalse();
        assertThat(permissionPolicy.matches("low-value-settings-locations", "POST", assetEditor)).isFalse();

        Set<String> configAdmin = new HashSet<>(Arrays.asList("fa:settings", "lv:settings", "fa:view"));
        assertThat(permissionPolicy.matches("fixed-asset-settings-locations", "GET", configAdmin)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-settings-locations", "POST", configAdmin)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-settings-categories", "DELETE", configAdmin)).isTrue();
        assertThat(permissionPolicy.matches("low-value-settings-locations", "POST", configAdmin)).isTrue();

        // 低值存放位置：普通角色可读（物品表单/领用下拉），不可写
        Set<String> viewer = new HashSet<>(Collections.singletonList("lv:view"));
        assertThat(permissionPolicy.matches("low-value-settings-locations", "GET", viewer)).isTrue();
        assertThat(permissionPolicy.matches("low-value-settings-locations", "POST", viewer)).isFalse();

        // 折旧方案/规则：普通角色可读（折旧台账计算），维护仍需 fa:settings
        assertThat(permissionPolicy.matches("fixed-asset-settings-depreciation-plans", "GET", assetEditor)).isTrue();
        assertThat(permissionPolicy.matches("fixed-asset-settings-depreciation-plans", "POST", assetEditor)).isFalse();
    }

    private String createCompany(String code, String name) throws Exception {
        String response = mockMvc.perform(auth(post("/api/org-companies")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(companyPayload(code, name)))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).path("data").path("id").asText();
    }

    private static Map<String, Object> companyPayload(String code, String name) {
        Map<String, Object> company = new HashMap<>();
        company.put("code", code);
        company.put("name", name);
        company.put("status", "ENABLED");
        return company;
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
}
