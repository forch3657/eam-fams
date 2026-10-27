package com.fams.p5;

import com.fams.TestAccounts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

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
