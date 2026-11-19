package com.fams.p17;

import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.security.LoginAttemptService;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 扫码盘点真实链路集成测试（H2 内存库）。
 *
 * <p>分支单测 mock 了 GenericService，无法验证契约字段映射、全量替换语义、
 * 版本乐观锁与单据状态守卫在真实容器里的表现；这里用 MockMvc 走一遍
 * 建单 → 可盘单据列表 → 扫码登记 → 重复/幂等 → 回读明细落库。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P17InventoryScanIntegrationTest {

    private static final String DOCS = "fixed-asset-inventory-docs";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private GenericService genericService;
    @Autowired
    private LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
        loginAttemptService.loginSucceeded(TestAccounts.ADMIN);
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + TestAccounts.ADMIN
                                + "\",\"password\":\"" + TestAccounts.PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(response).path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder builder) {
        return builder.header("Authorization", "Bearer " + token);
    }

    private JsonNode dataOf(String json) throws Exception {
        return objectMapper.readTree(json).path("data");
    }

    private static Map<String, Object> item(String assetNo, String result) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("assetId", "ASSET-" + assetNo);
        item.put("assetNo", assetNo);
        item.put("assetName", "资产 " + assetNo);
        item.put("result", result);
        item.put("itemStatus", "UNCHECKED");
        item.put("remark", "");
        return item;
    }

    private String createDoc(String status, List<Map<String, Object>> items) throws Exception {
        Map<String, Object> doc = new HashMap<>();
        doc.put("docNo", "PD-SCAN-" + System.nanoTime());
        doc.put("name", "扫码链路测试单");
        doc.put("companyId", "C1");
        doc.put("creatorId", "U1");
        doc.put("status", status);
        doc.put("remark", "集成测试原始备注");
        doc.put("items", items);
        String created = mockMvc.perform(auth(post("/api/" + DOCS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return dataOf(created).path("id").asText();
    }

    private JsonNode record(String docId, String assetNo, String scanId, boolean overwrite) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("assetNo", assetNo);
        body.put("result", "MATCHED");
        body.put("clientScanId", scanId);
        body.put("overwrite", overwrite);
        String json = mockMvc.perform(auth(post("/api/inventory-scan/" + docId + "/record"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return dataOf(json);
    }

    @Test
    @DisplayName("建单 → 可盘列表 → 连续登记 → 重复/幂等 → 明细真正落库且其它字段不被清空")
    void fullScanChain() throws Exception {
        String no1 = "SCAN-A-" + System.nanoTime();
        String no2 = "SCAN-B-" + System.nanoTime();
        List<Map<String, Object>> items = new ArrayList<>(
                Arrays.asList(item(no1, "UNCHECKED"), item(no2, "UNCHECKED")));
        String docId = createDoc("DRAFT", items);

        // 可盘单据摘要应包含这张草稿单
        String docsJson = mockMvc.perform(auth(get("/api/inventory-scan/docs")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = dataOf(docsJson);
        boolean found = false;
        for (JsonNode row : rows) {
            if (docId.equals(row.path("id").asText())) {
                found = true;
                assertThat(row.path("total").asInt()).isEqualTo(2);
                assertThat(row.path("counted").asInt()).isZero();
            }
        }
        assertThat(found).isTrue();

        // 第一条登记
        JsonNode first = record(docId, no1, "scan-1", false);
        assertThat(first.path("status").asText()).isEqualTo("RECORDED");
        assertThat(first.path("counted").asInt()).isEqualTo(1);
        assertThat(first.path("version").asInt()).isEqualTo(2);

        // 同一 clientScanId 重试：幂等，不重复计数
        JsonNode idem = record(docId, no1, "scan-1", false);
        assertThat(idem.path("status").asText()).isEqualTo("IDEMPOTENT");
        assertThat(idem.path("counted").asInt()).isEqualTo(1);

        // 换扫码键重扫同一资产：重复提示，不改写
        JsonNode dup = record(docId, no1, "scan-2", false);
        assertThat(dup.path("status").asText()).isEqualTo("DUPLICATE");

        // 第二条登记，进度到 2/2
        JsonNode second = record(docId, no2, "scan-3", false);
        assertThat(second.path("status").asText()).isEqualTo("RECORDED");
        assertThat(second.path("counted").asInt()).isEqualTo(2);

        // 回读真实单据：两条明细均已落库，且全量替换没把 name/remark 等字段清空
        String detail = mockMvc.perform(auth(get("/api/" + DOCS + "/" + docId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode saved = dataOf(detail);
        assertThat(saved.path("name").asText()).isEqualTo("扫码链路测试单");
        assertThat(saved.path("remark").asText()).isEqualTo("集成测试原始备注");
        assertThat(saved.path("docNo").asText()).startsWith("PD-SCAN-");
        assertThat(saved.path("items").size()).isEqualTo(2);
        assertThat(saved.path("items").get(0).path("result").asText()).isEqualTo("MATCHED");
        assertThat(saved.path("items").get(0).path("itemStatus").asText()).isEqualTo("CHECKED");
        assertThat(saved.path("items").get(0).path("scanId").asText()).isEqualTo("scan-1");
        assertThat(saved.path("items").get(1).path("result").asText()).isEqualTo("MATCHED");
        // create=1，两次成功登记各 +1；幂等与重复扫不写库，所以最终是 3
        assertThat(saved.path("version").asInt()).isEqualTo(3);
    }

    @Test
    @DisplayName("清单外资产返回 NOT_IN_SCOPE；审批中单据拒绝登记")
    void scopeAndImmutableStatus() throws Exception {
        String no1 = "SCAN-C-" + System.nanoTime();
        String docId = createDoc("DRAFT", new ArrayList<>(Arrays.asList(item(no1, "UNCHECKED"))));

        JsonNode outside = record(docId, "NOT-EXIST-" + System.nanoTime(), "scan-x", false);
        assertThat(outside.path("status").asText()).isEqualTo("NOT_IN_SCOPE");

        // 直接把单据推进到审批中（通用 PUT 允许 DRAFT → PROCESSING 前的状态写入需通过审批端点，
        // 这里用 updateQuietly 模拟已进入审批，验证扫码端点不会绕过状态守卫）
        Map<String, Object> doc = genericService.get(DOCS, docId);
        doc.put("status", "PROCESSING");
        genericService.updateQuietly(DOCS, docId, doc);

        mockMvc.perform(auth(post("/api/inventory-scan/" + docId + "/record"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assetNo\":\"" + no1 + "\",\"clientScanId\":\"scan-y\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("缺 fa:inventory 的账号不能登记；参数错误返回 400")
    void permissionAndValidation() throws Exception {
        String no1 = "SCAN-D-" + System.nanoTime();
        String docId = createDoc("DRAFT", new ArrayList<>(Arrays.asList(item(no1, "UNCHECKED"))));

        mockMvc.perform(auth(post("/api/inventory-scan/" + docId + "/record"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientScanId\":\"scan-z\"}"))
                .andExpect(status().isBadRequest());

        // 无权限账号：登录审计员（R6）后调端点应 403
        String auditor = "scan_auditor_" + System.nanoTime();
        Map<String, Object> user = new HashMap<>();
        user.put("code", auditor);
        user.put("name", "扫码审计员");
        user.put("username", auditor);
        user.put("password", "Test@12345");
        user.put("phone", "13900000001");
        user.put("roleIds", Arrays.asList("R6"));
        user.put("roleId", "R6");
        user.put("deptId", "D1");
        user.put("companyId", "C1");
        user.put("status", "ENABLED");
        genericService.create("org-users", user);

        String loginBody = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + auditor + "\",\"password\":\"Test@12345\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String auditorToken = dataOf(loginBody).path("token").asText();

        mockMvc.perform(post("/api/inventory-scan/" + docId + "/record")
                        .header("Authorization", "Bearer " + auditorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assetNo\":\"" + no1 + "\",\"clientScanId\":\"scan-w\"}"))
                .andExpect(status().isForbidden());
    }
}
