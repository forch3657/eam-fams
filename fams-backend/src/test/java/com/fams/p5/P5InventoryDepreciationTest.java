package com.fams.p5;

import com.fams.TestAccounts;

import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P5 盘点与折旧验收：盘点计划/单据、折旧方案/报表/明细的通用端点可用性。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P5InventoryDepreciationTest {

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    private static final String PLANS = "fixed-asset-inventory-plans";

    private static final String DOCS = "fixed-asset-inventory-docs";

    private static final String SCHEMES = "fixed-asset-depreciation-schemes";

    private static final String REPORTS = "fixed-asset-depreciation-reports";

    private static final String DETAILS = "fixed-asset-report-depreciation-details";

    private static final String ASSETS = "fixed-assets";

    private static final String DISPOSE_DOCS = "fixed-asset-doc-lists-dispose";

    private static final String APPROVER_PASSWORD = "Test@12345";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GenericService genericService;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    @Autowired
    private LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
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
    @DisplayName("盘点计划：新增 → 详情 → 更新 → 删除全链路")
    void inventoryPlanCrud() throws Exception {
        String planNo = "IP-T5-" + System.nanoTime();
        Map<String, Object> plan = new HashMap<>();
        plan.put("planNo", planNo);
        plan.put("planName", "2026 年度全面盘点");
        plan.put("status", "DRAFT");

        String created = mockMvc.perform(auth(post("/api/" + PLANS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(plan))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.version").value(1))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        mockMvc.perform(auth(get("/api/" + PLANS + "/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.planNo").value(planNo));

        plan.put("status", "PROCESSING");
        mockMvc.perform(auth(put("/api/" + PLANS + "/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(plan))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"))
                .andExpect(jsonPath("$.data.version").value(2));

        mockMvc.perform(auth(delete("/api/" + PLANS + "/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
    }

    @Test
    @DisplayName("盘点计划：planNo 重复返回 409")
    void duplicatePlanNoReturns409() throws Exception {
        String planNo = "IP-DUP-" + System.nanoTime();
        Map<String, Object> plan = new HashMap<>();
        plan.put("planNo", planNo);
        plan.put("planName", "重复计划");
        plan.put("status", "DRAFT");

        String created = mockMvc.perform(auth(post("/api/" + PLANS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(plan))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        String response = mockMvc.perform(auth(post("/api/" + PLANS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(plan))))
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(objectMapper.readTree(response).path("code").asInt()).isEqualTo(409);

        mockMvc.perform(auth(delete("/api/" + PLANS + "/" + id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("盘点单据：新增后可按关键字检索并删除")
    void inventoryDocCrud() throws Exception {
        String docNo = "ID-T5-" + System.nanoTime();
        Map<String, Object> doc = new HashMap<>();
        doc.put("docNo", docNo);
        doc.put("name", "技术部盘点单");
        doc.put("status", "DRAFT");

        String created = mockMvc.perform(auth(post("/api/" + DOCS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        String body = mockMvc.perform(auth(get("/api/" + DOCS + "/page").param("keyword", docNo)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        assertThat(rows.size()).isEqualTo(1);
        assertThat(rows.get(0).path("id").asText()).isEqualTo(id);

        mockMvc.perform(auth(delete("/api/" + DOCS + "/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
    }

    @Test
    @DisplayName("折旧方案：四种折旧方法均为合法枚举值")
    void depreciationSchemeAcceptsAllMethods() throws Exception {
        String[] methods = {"STRAIGHT_LINE", "DOUBLE_DECLINE", "SUM_YEARS", "WORKLOAD"};
        for (String method : methods) {
            Map<String, Object> scheme = new HashMap<>();
            scheme.put("schemeNo", "DS-T5-" + method + "-" + System.nanoTime());
            scheme.put("schemeName", method + " 方案");
            scheme.put("method", method);
            scheme.put("years", 5);
            scheme.put("residualRate", 5);
            scheme.put("enabled", true);

            mockMvc.perform(auth(post("/api/" + SCHEMES)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(scheme))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.method").value(method));
        }
    }

    @Test
    @DisplayName("折旧方案：非法折旧方法返回 422")
    void depreciationSchemeRejectsUnknownMethod() throws Exception {
        Map<String, Object> scheme = new HashMap<>();
        scheme.put("schemeNo", "DS-BAD-" + System.nanoTime());
        scheme.put("schemeName", "非法方法方案");
        scheme.put("method", "NOT_A_METHOD");
        scheme.put("years", 5);

        mockMvc.perform(auth(post("/api/" + SCHEMES)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(scheme))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value(422));
    }

    @Test
    @DisplayName("折旧报表与明细：按期间检索")
    void depreciationReportAndDetails() throws Exception {
        String period = "2026-T5-" + System.nanoTime();

        Map<String, Object> report = new HashMap<>();
        report.put("period", period);
        report.put("openingValue", 120000);
        report.put("periodDepreciation", 1900);
        report.put("accumulated", 22800);
        report.put("closingNet", 97200);
        report.put("assetCount", 12);
        report.put("operator", "admin");
        String createdReport = mockMvc.perform(auth(post("/api/" + REPORTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(report))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String reportId = objectMapper.readTree(createdReport).path("data").path("id").asText();
        assertThat(reportId).isNotBlank();

        Map<String, Object> detail = new HashMap<>();
        detail.put("name", "折旧明细资产");
        detail.put("originalValue", 12000);
        detail.put("accumulatedDepreciation", 190);
        detail.put("netValue", 11810);
        detail.put("depreciationMethod", "STRAIGHT_LINE");
        detail.put("usefulLife", 5);
        String createdDetail = mockMvc.perform(auth(post("/api/" + DETAILS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(detail))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String detailId = objectMapper.readTree(createdDetail).path("data").path("id").asText();

        String body = mockMvc.perform(auth(get("/api/" + DETAILS + "/page")
                        .param("keyword", "折旧明细资产")
                        .param("pageSize", "20")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        boolean found = false;
        for (JsonNode row : rows) {
            if (detailId.equals(row.path("id").asText())) {
                found = true;
            }
        }
        assertThat(found).isTrue();

        mockMvc.perform(auth(delete("/api/" + DETAILS + "/" + detailId))).andExpect(status().isOk());
        mockMvc.perform(auth(delete("/api/" + REPORTS + "/" + reportId))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("盘点单：未盘完不能送审；审批完结后盘亏明细自动生成处置单")
    void inventoryApprovalRequiresFinishedCheckAndCreatesLossDisposal() throws Exception {
        // 盘点流程的审批人：资产管理员（R2）走结果确认与差异复核，审计员（R6）走抽查确认
        String assetToken = ensureApprover("inv_asset_tester", "R2");
        String auditToken = ensureApprover("inv_audit_tester", "R6");
        String assetCode = "INV-T5-" + System.nanoTime();
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", assetCode);
        asset.put("name", "盘点测试资产");
        asset.put("category", "ELECTRONIC");
        asset.put("companyId", "C1");
        asset.put("deptId", "D1");
        asset.put("status", "IDLE");
        asset.put("original", 1000);
        asset.put("net", 1000);
        String assetId = createAsset(asset);

        Map<String, Object> doc = new HashMap<>();
        doc.put("docNo", "PD-T5-" + System.nanoTime());
        doc.put("name", "盘点闭环测试");
        doc.put("companyId", "C1");
        doc.put("creatorId", "U1");
        doc.put("status", "DRAFT");
        List<Map<String, Object>> items = new ArrayList<>();
        items.add(checkItem(assetId, assetCode, "盘点测试资产", "UNCHECKED", "UNCHECKED", ""));
        items.add(checkItem(assetId, assetCode, "盘点测试资产（盘亏）", "LOSS", "LOSS", "现场未找到实物"));
        doc.put("items", items);
        String docId = createInventoryDoc(doc);

        // 还有未盘明细 → 不允许送审
        mockMvc.perform(auth(post("/api/approvals/action"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId + "\",\"action\":\"submit\"}"))
                .andExpect(status().isBadRequest());

        // 全部登记结果后可送审
        items.get(0).put("result", "MATCHED");
        items.get(0).put("itemStatus", "CHECKED");
        items.get(0).put("remark", "账实相符");
        doc.put("items", items);
        mockMvc.perform(auth(put("/api/" + DOCS + "/" + docId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk());

        mockMvc.perform(auth(post("/api/approvals/action"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId
                                + "\",\"action\":\"submit\",\"ctx\":{\"amount\":0,\"hasDiff\":true}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"));

        // 逐环节审批到完结：盘点结果确认 / 差异复核 → 资产管理员（R2），审计抽查 → 审计员（R6）
        approve(docId, assetToken, "PROCESSING");
        approve(docId, assetToken, "PROCESSING");
        approve(docId, auditToken, "DONE");

        Map<String, Object> finished = genericService.get(DOCS, docId);
        assertThat(String.valueOf(finished.get("status"))).isEqualTo("DONE");

        // 盘亏明细生成处置单草案（带真实资产主键，等管理员走处置审批）
        boolean found = false;
        for (Map<String, Object> row : genericService.list(DISPOSE_DOCS, Collections.emptyMap())) {
            if (assetId.equals(String.valueOf(row.get("assetId")))
                    && String.valueOf(row.get("remark")).contains("盘点盘亏核销")) {
                found = true;
            }
        }
        assertThat(found).isTrue();
    }

    /**
     * 盘点差异必须由服务端按明细事实判定。
     *
     * <p>hasDiff 决定「差异复核」「审计抽查」是否生效，若采信客户端传值，
     * 伪造 hasDiff=false 就能一次审批直接完结，盘点差异等于没人管。</p>
     */
    @Test
    @DisplayName("盘点差异由服务端判定：伪造 hasDiff=false 也必须走差异复核与审计抽查")
    void inventoryDiffStepsCannotBeSkippedByForgedContext() throws Exception {
        String assetToken = ensureApprover("inv_asset_ctx", "R2");
        String auditToken = ensureApprover("inv_audit_ctx", "R6");
        String assetCode = "INV-CTX-" + System.nanoTime();
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", assetCode);
        asset.put("name", "盘点差异判定资产");
        asset.put("category", "ELECTRONIC");
        asset.put("companyId", "C1");
        asset.put("deptId", "D1");
        asset.put("status", "IDLE");
        asset.put("original", 1000);
        asset.put("net", 1000);
        String assetId = createAsset(asset);

        List<Map<String, Object>> items = new ArrayList<>();
        items.add(checkItem(assetId, assetCode, "盘点差异判定资产", "MATCHED", "CHECKED", "账实相符"));
        items.add(checkItem(assetId, assetCode, "盘点差异判定资产（盘亏）", "LOSS", "LOSS", "现场未找到实物"));
        Map<String, Object> doc = new HashMap<>();
        doc.put("docNo", "PD-CTX-" + System.nanoTime());
        doc.put("name", "盘点差异判定测试");
        doc.put("companyId", "C1");
        doc.put("creatorId", "U1");
        doc.put("status", "DRAFT");
        doc.put("items", items);
        String docId = createInventoryDoc(doc);

        // 送审时刻意伪造 hasDiff=false：服务端仍应按明细事实判定「存在差异」
        mockMvc.perform(auth(post("/api/approvals/action"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId
                                + "\",\"action\":\"submit\",\"ctx\":{\"amount\":0,\"hasDiff\":false}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"));

        // 审批同样伪造 hasDiff=false：结果确认之后仍是审批中，说明差异复核没被跳过
        approve(docId, assetToken, "PROCESSING", false);
        // 差异复核之后仍是审批中，说明审计抽查也没被跳过
        approve(docId, assetToken, "PROCESSING", false);
        // 审计抽查通过才完结
        approve(docId, auditToken, "DONE", false);
    }

    /**
     * 无差异的盘点单不需要差异复核与审计抽查：结果确认一个环节即可完结。
     */
    @Test
    @DisplayName("盘点无差异时只走结果确认环节，一次审批即完结")
    void inventoryWithoutDiffNeedsSingleApprovalStep() throws Exception {
        String assetToken = ensureApprover("inv_asset_nodiff", "R2");
        String assetCode = "INV-NODIFF-" + System.nanoTime();
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", assetCode);
        asset.put("name", "盘点无差异资产");
        asset.put("category", "ELECTRONIC");
        asset.put("companyId", "C1");
        asset.put("deptId", "D1");
        asset.put("status", "IDLE");
        asset.put("original", 1000);
        asset.put("net", 1000);
        String assetId = createAsset(asset);

        List<Map<String, Object>> items = new ArrayList<>();
        items.add(checkItem(assetId, assetCode, "盘点无差异资产", "MATCHED", "CHECKED", "账实相符"));
        Map<String, Object> doc = new HashMap<>();
        doc.put("docNo", "PD-NODIFF-" + System.nanoTime());
        doc.put("name", "盘点无差异测试");
        doc.put("companyId", "C1");
        doc.put("creatorId", "U1");
        doc.put("status", "DRAFT");
        doc.put("items", items);
        String docId = createInventoryDoc(doc);

        mockMvc.perform(auth(post("/api/approvals/action"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId
                                + "\",\"action\":\"submit\",\"ctx\":{\"amount\":0,\"hasDiff\":false}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"));

        approve(docId, assetToken, "DONE", false);
    }

    /**
     * 连续完结两张有盘亏的盘点单：处置单号不能冲突。
     *
     * <p>处置单号原先只精确到秒，两张盘点单在同一秒完结就会撞唯一键；
     * 撞键抛出的异常又把主事务标记成 rollback-only，第二次审批动作直接 500。</p>
     */
    @Test
    @DisplayName("连续完结两张有盘亏的盘点单：处置单号不冲突，审批不报 500")
    void twoLossDisposalsDoNotConflictOnUniqueCode() throws Exception {
        String assetToken = ensureApprover("inv_asset_two", "R2");
        String auditToken = ensureApprover("inv_audit_two", "R6");
        String assetCode = "INV-TWO-" + System.nanoTime();
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", assetCode);
        asset.put("name", "连续盘亏资产");
        asset.put("category", "ELECTRONIC");
        asset.put("companyId", "C1");
        asset.put("deptId", "D1");
        asset.put("status", "IDLE");
        asset.put("original", 1000);
        asset.put("net", 1000);
        String assetId = createAsset(asset);

        List<String> docIds = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            List<Map<String, Object>> items = new ArrayList<>();
            items.add(checkItem(assetId, assetCode, "连续盘亏资产", "LOSS", "LOSS", "现场未找到实物"));
            Map<String, Object> doc = new HashMap<>();
            doc.put("docNo", "PD-TWO-" + System.nanoTime());
            doc.put("name", "连续盘亏盘点单" + i);
            doc.put("companyId", "C1");
            doc.put("creatorId", "U1");
            doc.put("status", "DRAFT");
            doc.put("items", items);
            docIds.add(createInventoryDoc(doc));
        }

        for (String docId : docIds) {
            mockMvc.perform(auth(post("/api/approvals/action"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId
                                    + "\",\"action\":\"submit\",\"ctx\":{\"amount\":0,\"hasDiff\":true}}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("PROCESSING"));
            approve(docId, assetToken, "PROCESSING");
            approve(docId, assetToken, "PROCESSING");
            approve(docId, auditToken, "DONE");
        }

        // 两张盘点单各自生成一张处置单，单号互不相同
        Set<String> codes = new HashSet<>();
        int lossDisposals = 0;
        for (Map<String, Object> row : genericService.list(DISPOSE_DOCS, Collections.emptyMap())) {
            if (String.valueOf(row.get("remark")).contains("盘点盘亏核销")) {
                lossDisposals++;
                codes.add(String.valueOf(row.get("code")));
            }
        }
        assertThat(lossDisposals).isGreaterThanOrEqualTo(2);
        assertThat(codes.size()).isGreaterThanOrEqualTo(2);
    }

    /**
     * 盘点单不传单号时由服务端生成。
     *
     * <p>前端按可见列表推算单号会跨数据范围撞号（两个管理员同一天各建一张，
     * 必然撞 unique 约束），单号必须由服务端按全表最大序号生成。</p>
     */
    @Test
    @DisplayName("盘点单不传单号时由服务端生成，连续创建不撞号")
    void inventoryDocNoIsGeneratedByServer() throws Exception {
        Set<String> docNos = new HashSet<>();
        for (int i = 0; i < 2; i++) {
            Map<String, Object> doc = new HashMap<>();
            doc.put("name", "服务端生成单号测试" + i);
            doc.put("companyId", "C1");
            doc.put("creatorId", "U1");
            doc.put("status", "DRAFT");
            doc.put("items", new ArrayList<>());
            String created = mockMvc.perform(auth(post("/api/" + DOCS))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(doc)))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
            String docNo = objectMapper.readTree(created).path("data").path("docNo").asText();
            assertThat(docNo).startsWith("PD");
            docNos.add(docNo);
        }
        assertThat(docNos).hasSize(2);
    }

    /** 走一次盘点审批动作，返回单据状态 */
    private String approve(String docId, String approveToken, String expectedStatus) throws Exception {
        return approve(docId, approveToken, expectedStatus, true);
    }

    /**
     * 走一次盘点审批动作，返回单据状态。
     *
     * @param hasDiff 客户端伪造的条件上下文，用来验证服务端不采信它
     */
    private String approve(String docId, String approveToken, String expectedStatus, boolean hasDiff)
            throws Exception {
        String body = mockMvc.perform(post("/api/approvals/action")
                        .header("Authorization", "Bearer " + approveToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inventory\",\"docId\":\"" + docId
                                + "\",\"action\":\"approve\",\"ctx\":{\"amount\":0,\"hasDiff\":" + hasDiff + "}}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String status = objectMapper.readTree(body).path("data").path("status").asText();
        assertThat(status).isEqualTo(expectedStatus);
        return status;
    }

    /** 造一个持有指定角色的盘点审批人 */
    private String ensureApprover(String username, String roleId) throws Exception {
        for (Map<String, Object> row : genericService.list("org-users", Collections.emptyMap())) {
            if (username.equals(String.valueOf(row.get("username")))) {
                return loginAs(username, APPROVER_PASSWORD);
            }
        }
        Map<String, Object> user = new HashMap<>();
        user.put("code", "INV-" + roleId + "-" + System.nanoTime());
        user.put("name", "盘点审批人" + roleId);
        user.put("username", username);
        user.put("password", passwordEncoder.encode(APPROVER_PASSWORD));
        user.put("phone", "1390000" + Math.abs(username.hashCode() % 10000));
        user.put("roleIds", java.util.Arrays.asList(roleId));
        user.put("roleId", roleId);
        user.put("deptId", "D1");
        user.put("companyId", "C1");
        user.put("status", "ENABLED");
        genericService.create("org-users", user);
        return loginAs(username, APPROVER_PASSWORD);
    }

    private String loginAs(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(username, password)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).path("data").path("token").asText();
    }

    private String createAsset(Map<String, Object> asset) throws Exception {
        String created = mockMvc.perform(auth(post("/api/" + ASSETS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(asset)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(created).path("data").path("id").asText();
    }

    private String createInventoryDoc(Map<String, Object> doc) throws Exception {
        String created = mockMvc.perform(auth(post("/api/" + DOCS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(created).path("data").path("id").asText();
    }

    private static Map<String, Object> checkItem(String assetId, String assetNo, String assetName,
                                                 String result, String itemStatus, String remark) {
        Map<String, Object> item = new HashMap<>();
        item.put("assetId", assetId);
        item.put("assetNo", assetNo);
        item.put("assetName", assetName);
        item.put("result", result);
        item.put("itemStatus", itemStatus);
        item.put("remark", remark);
        return item;
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
