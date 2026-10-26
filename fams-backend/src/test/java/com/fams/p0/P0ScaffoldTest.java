package com.fams.p0;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P0 骨架验收：统一信封、时间格式、全局异常、CORS。
 *
 * <p>本期不引入 Security 过滤器（P1 负责），故此处 addFilters = false，
 * 以证明骨架本身可独立运行。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class P0ScaffoldTest {

    private static final String ORIGIN = "http://localhost:5174";

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("健康检查返回统一信封且时间为 ISO 8601")
    void healthReturnsEnvelope() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.message").value("ok"))
                .andExpect(jsonPath("$.data.status").value("UP"))
                // 契约要求 ISO 8601（允许带毫秒），且禁止时间戳形式
                .andExpect(jsonPath("$.data.time",
                        matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})?")));
    }

    @Test
    @DisplayName("失败响应省略 data 字段，不污染信封")
    void errorResponseOmitsData() throws Exception {
        mockMvc.perform(get("/api/not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value(404))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    @DisplayName("CORS 预检放行前端来源 5174")
    void corsPreflightAllowed() throws Exception {
        mockMvc.perform(options("/api/health")
                        .header("Origin", ORIGIN)
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
    }
}
