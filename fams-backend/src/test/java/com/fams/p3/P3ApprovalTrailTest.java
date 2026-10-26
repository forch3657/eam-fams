package com.fams.p3;

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
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P3 审批轨迹验收：审批动作端点 + 绕过端点改状态时的钩子兜底。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P3ApprovalTrailTest {

    private static final String ADMIN = "admin";

    private static final String PASSWORD = "123456";

    private static final String APPROVER = "audit_tester";

    private static final String APPROVER_PASSWORD = "Test@12345";

    private static final String DOC_LISTS = "fixed-asset-doc-lists-inbound";

    private static final String APPROVALS = "fixed-asset-doc-approvals";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GenericService genericService;

    @Autowired
    private LoginAttemptService loginAttemptService;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    private String token;

    @BeforeEach
    void login() throws Exception {
        ensureApprover();
        loginAttemptService.loginSucceeded(ADMIN);
        if (token != null) {
            return;
        }
        token = loginAs(ADMIN, PASSWORD);
        assertThat(token).isNotBlank();
    }

    @Test
    @DisplayName("草稿 → 审批中：钩子自动补一条「提交」轨迹")
    void hookGeneratesSubmitTrail() throws Exception {
        Map<String, Object> doc = inboundDoc("SUBMIT-TRAIL", "DRAFT");
        String id = createDoc(doc);
        assertThat(trailsOf(id)).isEmpty();

        doc.put("status", "PROCESSING");
        mockMvc.perform(auth(put("/api/" + DOC_LISTS + "/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk());

        JsonNode trails = trailsOf(id);
        assertThat(trails).hasSize(1);
        assertThat(trails.get(0).path("result").asText()).isEqualTo("SUBMIT");
        assertThat(trails.get(0).path("docKey").asText()).isEqualTo("inbound");
        assertThat(trails.get(0).path("bizType").asText()).isEqualTo("INBOUND");
        assertThat(trails.get(0).path("stepName").asText()).isEqualTo("提交申请");
    }

    @Test
    @DisplayName("审批中 → 已驳回：钩子自动补一条「驳回」轨迹")
    void hookGeneratesRejectTrail() throws Exception {
        Map<String, Object> doc = inboundDoc("REJECT-TRAIL", "PROCESSING");
        String id = createDoc(doc);
        assertThat(trailsOf(id)).hasSize(1);

        doc.put("status", "REJECTED");
        doc.put("remark", "不符合入库条件");
        mockMvc.perform(auth(put("/api/" + DOC_LISTS + "/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk());

        JsonNode trails = trailsOf(id);
        assertThat(trails).hasSize(2);
        assertThat(trails.get(1).path("result").asText()).isEqualTo("REJECT");
        assertThat(trails.get(1).path("comment").asText()).isEqualTo("不符合入库条件");
    }

    @Test
    @DisplayName("审批动作端点：提交草稿单据成功并落一条轨迹")
    void endpointSubmitsDraft() throws Exception {
        Map<String, Object> doc = inboundDoc("ENDPOINT-SUBMIT", "DRAFT");
        String id = createDoc(doc);
        assertThat(trailsOf(id)).isEmpty();

        String body = mockMvc.perform(auth(post("/api/approvals/action")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inbound\",\"docId\":\"" + id + "\",\"action\":\"submit\"}")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(objectMapper.readTree(body).path("data").path("status").asText()).isEqualTo("PROCESSING");

        Map<String, Object> saved = genericService.get(DOC_LISTS, id);
        assertThat(String.valueOf(saved.get("status"))).isEqualTo("PROCESSING");
        assertThat(trailsOf(id)).hasSize(1);
    }

    @Test
    @DisplayName("审批动作端点：非审批中的单据提交返回 409")
    void endpointSubmitRequiresDraftOrRejected() throws Exception {
        Map<String, Object> doc = inboundDoc("SUBMIT-CONFLICT", "PROCESSING");
        String id = createDoc(doc);

        mockMvc.perform(auth(post("/api/approvals/action")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inbound\",\"docId\":\"" + id + "\",\"action\":\"submit\"}")))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("审批动作端点：当前登录人不是环节审批人时返回 403")
    void endpointRejectsApproverWithoutRole() throws Exception {
        Map<String, Object> doc = inboundDoc("APPROVE-NO-ROLE", "PROCESSING");
        String id = createDoc(doc);

        mockMvc.perform(auth(post("/api/approvals/action")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"docKey\":\"inbound\",\"docId\":\"" + id + "\",\"action\":\"approve\"}")))
                .andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------ 工具

    private String loginAs(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(username, password)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(response).path("data").path("token").asText();
    }

    /** 造一个同时持有「仓库员 / 资产管理员」角色的审批人，用于走通审批链路 */
    private void ensureApprover() {
        for (Map<String, Object> row : genericService.list("org-users", java.util.Collections.emptyMap())) {
            if (APPROVER.equals(String.valueOf(row.get("username")))) {
                return;
            }
        }
        Map<String, Object> user = new HashMap<>();
        user.put("code", "AUDIT-TESTER");
        user.put("name", "审计测试员");
        user.put("username", APPROVER);
        user.put("password", passwordEncoder.encode(APPROVER_PASSWORD));
        user.put("phone", "13900000000");
        user.put("email", "audit_tester@fams.com");
        user.put("roleIds", Arrays.asList("R8", "R2"));
        user.put("roleId", "R8");
        user.put("deptId", "D1");
        user.put("companyId", "C1");
        user.put("status", "ENABLED");
        genericService.create("org-users", user);
    }

    private static Map<String, Object> inboundDoc(String code, String status) {
        Map<String, Object> doc = new HashMap<>();
        doc.put("code", code + "-" + System.nanoTime());
        doc.put("name", "入库单 " + code);
        doc.put("status", status);
        doc.put("creatorId", "U1");
        return doc;
    }

    private String createDoc(Map<String, Object> doc) throws Exception {
        String body = mockMvc.perform(auth(post("/api/" + DOC_LISTS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(doc))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body).path("data").path("id").asText();
    }

    private JsonNode trailsOf(String docId) throws Exception {
        String body = mockMvc.perform(auth(get("/api/" + APPROVALS + "/page").param("pageSize", "2000")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        List<JsonNode> matched = new ArrayList<>();
        for (JsonNode row : rows) {
            if (docId.equals(row.path("docId").asText())) {
                matched.add(row);
            }
        }
        matched.sort((a, b) -> a.path("time").asText().compareTo(b.path("time").asText()));
        return objectMapper.valueToTree(matched);
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
