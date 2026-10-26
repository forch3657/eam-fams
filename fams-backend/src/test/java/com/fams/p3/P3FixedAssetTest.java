package com.fams.p3;

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
 * P3 固定资产验收：台账、8 类业务单据、审批轨迹与删除保护。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P3FixedAssetTest {

    private static final String ADMIN = "admin";

    private static final String PASSWORD = "123456";

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
    @DisplayName("台账：新增资产入库，主键与审计字段由服务端生成")
    void createAssetReturnsGeneratedId() throws Exception {
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", "FA-T3-" + System.currentTimeMillis());
        asset.put("name", "P3 测试资产");
        asset.put("category", "ELECTRONIC");
        asset.put("status", "IDLE");
        asset.put("amount", 1);
        asset.put("original", 6999);

        mockMvc.perform(auth(post("/api/fixed-assets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(asset))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.createTime").exists());
    }

    @Test
    @DisplayName("PUT 为全量替换：body 缺失的字段被清空，version 自增")
    void putReplacesWholeRow() throws Exception {
        String id = createAsset("FA-PUT");
        Map<String, Object> full = new HashMap<>();
        full.put("code", "FA-PUT-OK");
        full.put("name", "全量替换资产");
        full.put("category", "ELECTRONIC");
        full.put("status", "IDLE");
        full.put("brand", "某品牌");
        full.put("model", "X-100");

        mockMvc.perform(auth(put("/api/fixed-assets/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(full))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.brand").value("某品牌"));

        // 再次 PUT，故意不带 brand / model
        Map<String, Object> partial = new HashMap<>();
        partial.put("code", "FA-PUT-OK");
        partial.put("name", "全量替换资产");
        partial.put("category", "ELECTRONIC");
        partial.put("status", "IN_USE");

        mockMvc.perform(auth(put("/api/fixed-assets/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partial))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(3))
                .andExpect(jsonPath("$.data.status").value("IN_USE"));

        String body = mockMvc.perform(auth(get("/api/fixed-assets/" + id)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode row = objectMapper.readTree(body).path("data");
        assertThat(row.has("brand")).isFalse();
        assertThat(row.has("model")).isFalse();

        mockMvc.perform(auth(delete("/api/fixed-assets/" + id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("删除保护：资产被任意一类单据引用时返回 1003")
    void assetReferencedByDocCannotBeDeleted() throws Exception {
        String assetId = createAsset("FA-DEL");
        String code = "DOC-DEL-" + System.currentTimeMillis();

        Map<String, Object> doc = new HashMap<>();
        doc.put("code", code);
        doc.put("name", "引用该资产的入库单");
        doc.put("assetId", assetId);
        doc.put("status", "DRAFT");

        mockMvc.perform(auth(post("/api/fixed-asset-doc-lists-inbound")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk());

        String response = mockMvc.perform(auth(delete("/api/fixed-assets/" + assetId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1003);
        assertThat(node.path("message").asText()).contains("入库单");

        // 清理单据后再删资产应当成功
        String listBody = mockMvc.perform(auth(get("/api/fixed-asset-doc-lists-inbound")
                        .param("keyword", code)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(listBody).path("data");
        assertThat(rows.size()).isGreaterThan(0);
        String docId = rows.get(0).path("id").asText();
        mockMvc.perform(auth(delete("/api/fixed-asset-doc-lists-inbound/" + docId)))
                .andExpect(status().isOk());
        mockMvc.perform(auth(delete("/api/fixed-assets/" + assetId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
    }

    @Test
    @DisplayName("审批轨迹：单据的审批记录可按业务类型检索")
    void approvalTrailCanBeQueried() throws Exception {
        String assetId = createAsset("FA-APR");
        String docCode = "APR-" + System.currentTimeMillis();

        Map<String, Object> doc = new HashMap<>();
        doc.put("code", docCode);
        doc.put("name", "待审批入库单");
        doc.put("assetId", assetId);
        doc.put("status", "PROCESSING");
        String created = mockMvc.perform(auth(post("/api/fixed-asset-doc-lists-inbound")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String docId = objectMapper.readTree(created).path("data").path("id").asText();

        Map<String, Object> approval = new HashMap<>();
        approval.put("docKey", "inbound");
        approval.put("docId", docId);
        approval.put("docCode", docCode);
        approval.put("bizType", "INBOUND");
        approval.put("stepKey", "step-1");
        approval.put("stepName", "部门主管审批");
        approval.put("result", "AGREE");
        approval.put("approverId", "U1");
        approval.put("approverName", "系统管理员");

        mockMvc.perform(auth(post("/api/fixed-asset-doc-approvals")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(approval))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").isNotEmpty());

        String body = mockMvc.perform(auth(get("/api/fixed-asset-doc-approvals/page")
                        .param("docKey", "inbound")
                        .param("pageSize", "50")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        boolean found = false;
        for (JsonNode row : rows) {
            if (docId.equals(row.path("docId").asText()) && "AGREE".equals(row.path("result").asText())) {
                found = true;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    @DisplayName("单据状态非法时返回 422 且 details 含字段级错误")
    void invalidDocStatusReturns422() throws Exception {
        Map<String, Object> doc = new HashMap<>();
        doc.put("code", "APR-BAD-" + System.currentTimeMillis());
        doc.put("name", "状态非法的入库单");
        doc.put("status", "NOT_A_STATUS");

        String response = mockMvc.perform(auth(post("/api/fixed-asset-doc-lists-inbound")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isUnprocessableEntity())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(422);
        assertThat(node.path("details").isArray()).isTrue();
    }

    // ------------------------------------------------------------------ 工具

    private String createAsset(String prefix) throws Exception {
        Map<String, Object> asset = new HashMap<>();
        asset.put("code", prefix + "-" + System.currentTimeMillis() + "-" + (int) (Math.random() * 1000));
        asset.put("name", prefix + " 测试资产");
        asset.put("category", "ELECTRONIC");
        asset.put("status", "IDLE");
        asset.put("amount", 1);
        asset.put("original", 5000);
        String response = mockMvc.perform(auth(post("/api/fixed-assets")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(asset))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).path("data").path("id").asText();
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
