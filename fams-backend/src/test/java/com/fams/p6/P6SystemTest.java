package com.fams.p6;

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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P6 系统管理验收：字典动态端点、系统参数、流程配置、终端、消息中心与操作日志。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P6SystemTest {

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    private static final String DICT_TYPES = "system-dict-types";

    private static final String PARAMS = "system-params";

    private static final String FLOWS = "system-workflow-flows";

    private static final String DEVICES = "system-terminal-devices";

    private static final String ABNORMAL = "system-terminal-abnormal";

    private static final String MESSAGES = "notify-messages";

    private static final String LOGS = "operation-logs";

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
    @DisplayName("字典项：动态端点可用，写入自动带 dictCode")
    void dictItemDynamicEndpoint() throws Exception {
        String dictCode = "test_dict_" + System.nanoTime();
        create(DICT_TYPES, dictType(dictCode));

        String itemsKey = DICT_TYPES + "-" + dictCode + "-items";
        Map<String, Object> item = new HashMap<>();
        item.put("label", "测试项");
        item.put("value", "TEST_VALUE");
        item.put("sort", 1);
        item.put("status", "ENABLED");

        String created = mockMvc.perform(auth(post("/api/" + itemsKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(item))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.label").value("测试项"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        mockMvc.perform(auth(delete("/api/" + itemsKey + "/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
        mockMvc.perform(auth(delete("/api/" + DICT_TYPES + "/" + dictCode)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("字典类型：删除时级联清理其字典项，不产生孤儿数据")
    void dictTypeDeletionCascadesItems() throws Exception {
        String dictCode = "test_cascade_" + System.nanoTime();
        create(DICT_TYPES, dictType(dictCode));

        String itemsKey = DICT_TYPES + "-" + dictCode + "-items";
        create(itemsKey, dictItem("项一", "V1"));
        create(itemsKey, dictItem("项二", "V2"));
        assertThat(count(itemsKey)).isEqualTo(2);

        mockMvc.perform(auth(delete("/api/" + DICT_TYPES + "/" + dictCode)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
        assertThat(count(itemsKey)).isEqualTo(0);
    }

    @Test
    @DisplayName("系统参数：key 唯一，重复返回 409")
    void systemParamUniqueKey() throws Exception {
        String key = "test.param." + System.nanoTime();
        Map<String, Object> param = new HashMap<>();
        param.put("name", "测试参数");
        param.put("key", key);
        param.put("value", "1");
        param.put("type", "CUSTOM");

        String created = mockMvc.perform(auth(post("/api/" + PARAMS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(param))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        String response = mockMvc.perform(auth(post("/api/" + PARAMS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(param))))
                .andExpect(status().isConflict())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(objectMapper.readTree(response).path("code").asInt()).isEqualTo(409);

        mockMvc.perform(auth(delete("/api/" + PARAMS + "/" + id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("流程配置：code 唯一，重复返回 409")
    void workflowFlowUniqueCode() throws Exception {
        String code = "FLOW-T6-" + System.nanoTime();
        Map<String, Object> flow = new HashMap<>();
        flow.put("code", code);
        flow.put("name", "测试流程");
        flow.put("bizType", "INBOUND");
        flow.put("enabled", true);

        String created = mockMvc.perform(auth(post("/api/" + FLOWS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(flow))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        mockMvc.perform(auth(post("/api/" + FLOWS)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(flow))))
                .andExpect(status().isConflict());

        mockMvc.perform(auth(delete("/api/" + FLOWS + "/" + id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("终端删除保护：已产生异常记录时返回 1003")
    void terminalDeletionProtectedByAbnormal() throws Exception {
        String deviceCode = "DEV-T6-" + System.nanoTime();
        Map<String, Object> device = new HashMap<>();
        device.put("code", deviceCode);
        device.put("name", "测试终端");
        device.put("type", "PDA");
        device.put("status", "ONLINE");
        create(DEVICES, device);

        Map<String, Object> abnormal = new HashMap<>();
        abnormal.put("recordNo", "ABN-T6-" + System.nanoTime());
        abnormal.put("deviceCode", deviceCode);
        abnormal.put("type", "UNAUTHORIZED_BIND");
        abnormal.put("handled", false);
        create(ABNORMAL, abnormal);

        String response = mockMvc.perform(auth(delete("/api/" + DEVICES + "/" + deviceCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1003);
        assertThat(node.path("message").asText()).contains("异常记录");
    }

    @Test
    @DisplayName("消息中心：新增后可按标题检索")
    void notifyMessageSearchable() throws Exception {
        String title = "T6 测试消息 " + System.nanoTime();
        Map<String, Object> message = new HashMap<>();
        message.put("title", title);
        message.put("content", "内容");
        message.put("type", "SYSTEM");
        message.put("level", "INFO");
        message.put("read", false);
        String created = create(MESSAGES, message);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        String body = mockMvc.perform(auth(get("/api/" + MESSAGES + "/page")
                        .param("keyword", title)
                        .param("pageSize", "20")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        boolean found = false;
        for (JsonNode row : rows) {
            if (id.equals(row.path("id").asText())) {
                found = true;
            }
        }
        assertThat(found).isTrue();

        mockMvc.perform(auth(delete("/api/" + MESSAGES + "/" + id))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("操作日志：写操作由 AOP 自动落库")
    void operationLogWrittenAutomatically() throws Exception {
        Map<String, Object> param = new HashMap<>();
        param.put("name", "日志测试参数");
        param.put("key", "test.log." + System.nanoTime());
        param.put("type", "CUSTOM");
        String created = create(PARAMS, param);
        String id = objectMapper.readTree(created).path("data").path("id").asText();

        String body = mockMvc.perform(auth(get("/api/" + LOGS + "/page")
                        .param("module", "系统管理")
                        .param("action", "新增")
                        .param("result", "SUCCESS")
                        .param("pageSize", "200")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode rows = objectMapper.readTree(body).path("data").path("rows");
        boolean createdLogged = false;
        for (JsonNode row : rows) {
            if (id.equals(row.path("target").asText())) {
                createdLogged = true;
            }
        }
        assertThat(createdLogged).as(body).isTrue();

        mockMvc.perform(auth(delete("/api/" + PARAMS + "/" + id))).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ 工具

    private static Map<String, Object> dictType(String code) {
        Map<String, Object> row = new HashMap<>();
        row.put("code", code);
        row.put("name", code + " 字典");
        row.put("status", "ENABLED");
        return row;
    }

    private static Map<String, Object> dictItem(String label, String value) {
        Map<String, Object> row = new HashMap<>();
        row.put("label", label);
        row.put("value", value);
        row.put("sort", 1);
        row.put("status", "ENABLED");
        return row;
    }

    private String create(String collection, Map<String, Object> row) throws Exception {
        String response = mockMvc.perform(auth(post("/api/" + collection)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(row))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).as(response).isEqualTo(0);
        return response;
    }

    private int count(String collection) throws Exception {
        String body = mockMvc.perform(auth(get("/api/" + collection + "/page").param("pageSize", "200")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body).path("data").path("rows").size();
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
