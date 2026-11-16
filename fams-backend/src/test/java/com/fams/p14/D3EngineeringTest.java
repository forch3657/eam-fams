package com.fams.p14;

import com.fams.TestAccounts;
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
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * D3 门禁 3 证据：并发乐观锁 409、链路追踪 traceId、actuator 探活、资产状态枚举。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class D3EngineeringTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    private String token;

    @BeforeEach
    void login() throws Exception {
        if (token != null) return;
        String body = "{\"username\":\"" + TestAccounts.ADMIN + "\",\"password\":\"" + TestAccounts.PASSWORD + "\"}";
        String resp = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(resp).path("data").path("token").asText();
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder auth(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b) {
        return b.header("Authorization", "Bearer " + token);
    }

    @Test
    @DisplayName("乐观锁：携带过期 version 更新返回 409 CONFLICT")
    void staleVersionReturns409() throws Exception {
        // 取一条真实资产
        String list = mockMvc.perform(auth(get("/api/fixed-assets").param("pageSize", "1")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        String id = objectMapper.readTree(list).path("data").path(0).path("id").asText();
        String detail = mockMvc.perform(auth(get("/api/fixed-assets/" + id)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(detail).path("data");
        Map<String, Object> payload = objectMapper.convertValue(node, Map.class);
        payload.put("version", 999999); // 明显过期
        // 用不同的 name 避免被视为无变更
        payload.put("name", String.valueOf(payload.get("name")) + "-d3");

        mockMvc.perform(auth(put("/api/fixed-assets/" + id))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(409));
    }

    @Test
    @DisplayName("链路追踪：请求透传 X-Trace-Id 并由响应头回传")
    void traceIdEcho() throws Exception {
        mockMvc.perform(auth(get("/api/fixed-assets").header("X-Trace-Id", "d3-trace-123456")))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Trace-Id", "d3-trace-123456"));
    }

    @Test
    @DisplayName("链路追踪：未携带时自动生成 traceId")
    void traceIdGenerated() throws Exception {
        MvcResult r = mockMvc.perform(auth(get("/api/fixed-assets")))
                .andExpect(status().isOk()).andReturn();
        String trace = r.getResponse().getHeader("X-Trace-Id");
        assertThat(trace).isNotBlank();
        assertThat(trace.length()).isLessThanOrEqualTo(40);
    }

    @Test
    @DisplayName("actuator 探活：/api/actuator/health 免登录可访问")
    void actuatorHealth() throws Exception {
        // 注意配置 base-path=/api/actuator，但 Spring Security 白名单为 /api/actuator/health
        mockMvc.perform(get("/api/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
