package com.fams.p5;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fams.module.depreciation.DepreciationCalculator;
import com.fams.module.depreciation.DepreciationLine;
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

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P5 折旧计算验收：四种折旧方法的固定数值案例（含最后一年尾差）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P5DepreciationRunTest {

    private static final String ADMIN = "admin";

    private static final String PASSWORD = "123456";

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
    @DisplayName("年限平均法：月折旧 = 应计提总额 / 总月数，提足后累计等于应计提总额")
    void straightLine() {
        DepreciationLine line = DepreciationCalculator.calculate(
                DepreciationCalculator.STRAIGHT_LINE, new BigDecimal("12000"),
                new BigDecimal("5"), 120, LocalDate.of(2025, 1, 15), LocalDate.of(2026, 1, 31));
        assertThat(line.getOriginalValue()).isEqualByComparingTo(bd("12000"));
        assertThat(line.getCap()).isEqualByComparingTo(bd("11400"));
        assertThat(line.getUsedMonths()).isEqualTo(12);
        assertThat(line.getMonthly()).isEqualByComparingTo(bd("95.00"));
        assertThat(line.getAccumulated()).isEqualByComparingTo(bd("1140.00"));
        assertThat(line.getNetValue()).isEqualByComparingTo(bd("10860.00"));

        DepreciationLine finished = DepreciationCalculator.calculate(
                DepreciationCalculator.STRAIGHT_LINE, new BigDecimal("12000"),
                new BigDecimal("5"), 120, LocalDate.of(2016, 1, 15), LocalDate.of(2026, 1, 31));
        assertThat(finished.getUsedMonths()).isEqualTo(120);
        assertThat(finished.isFinished()).isTrue();
        assertThat(finished.getAccumulated()).isEqualByComparingTo(bd("11400.00"));
        assertThat(finished.getNetValue()).isEqualByComparingTo(bd("600.00"));
        assertThat(finished.getMonthly()).isEqualByComparingTo(bd("0.00"));
    }

    @Test
    @DisplayName("双倍余额递减法：最后两年改直线法，累计收敛到应计提总额")
    void doubleDecline() {
        DepreciationLine line = DepreciationCalculator.calculate(
                DepreciationCalculator.DOUBLE_DECLINE, new BigDecimal("10000"),
                new BigDecimal("10"), 60, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));
        // 第 1 年：10000 × 40% = 4000
        assertThat(line.getYearly()[0]).isEqualByComparingTo(bd("4000.00"));
        // 第 2 年：(10000−4000) × 40% = 2400
        assertThat(line.getYearly()[1]).isEqualByComparingTo(bd("2400.00"));
        // 第 3 年：(6000−2400) × 40% = 1440
        assertThat(line.getYearly()[2]).isEqualByComparingTo(bd("1440.00"));
        // 第 4、5 年：剩余应提额 9000−(4000+2400+1440)=1160，两年各 580
        assertThat(line.getYearly()[3]).isEqualByComparingTo(bd("580.00"));
        assertThat(line.getYearly()[4]).isEqualByComparingTo(bd("580.00"));
        assertThat(line.getMonthly()).isEqualByComparingTo(bd("333.33"));
    }

    @Test
    @DisplayName("年数总和法：按 (n−k+1)/Σ 递减，最后一年倒挤尾差")
    void sumOfYears() {
        DepreciationLine line = DepreciationCalculator.calculate(
                DepreciationCalculator.SUM_YEARS, new BigDecimal("12000"),
                new BigDecimal("5"), 60, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));
        BigDecimal cap = bd("11400");
        assertThat(line.getYearly()[0]).isEqualByComparingTo(bd("3800.00"));
        assertThat(line.getYearly()[1]).isEqualByComparingTo(bd("3040.00"));
        assertThat(line.getYearly()[2]).isEqualByComparingTo(bd("2280.00"));
        assertThat(line.getYearly()[3]).isEqualByComparingTo(bd("1520.00"));
        assertThat(line.getYearly()[4]).isEqualByComparingTo(bd("760.00"));
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal year : line.getYearly()) {
            sum = sum.add(year);
        }
        assertThat(sum).isEqualByComparingTo(cap);
    }

    @Test
    @DisplayName("工作量法：按时间进度分摊，最后一期尾差由倒挤吸收")
    void workload() {
        DepreciationLine line = DepreciationCalculator.calculate(
                DepreciationCalculator.WORKLOAD, new BigDecimal("10000"),
                BigDecimal.ZERO, 36, LocalDate.of(2024, 1, 10), LocalDate.of(2026, 1, 31));
        assertThat(line.getCap()).isEqualByComparingTo(bd("10000"));
        assertThat(line.getUsedMonths()).isEqualTo(24);
        assertThat(line.getAccumulated()).isEqualByComparingTo(bd("6666.67"));
        // 提足：累计恰好等于原值，净值为 0
        DepreciationLine finished = DepreciationCalculator.calculate(
                DepreciationCalculator.WORKLOAD, new BigDecimal("10000"),
                BigDecimal.ZERO, 36, LocalDate.of(2023, 1, 10), LocalDate.of(2026, 1, 31));
        assertThat(finished.isFinished()).isTrue();
        assertThat(finished.getAccumulated()).isEqualByComparingTo(bd("10000.00"));
        assertThat(finished.getNetValue()).isEqualByComparingTo(bd("0.00"));
    }

    @Test
    @DisplayName("计提接口：写入当期折旧报表与明细，重复计提幂等")
    void runDepreciation() throws Exception {
        String period = "2026-09";
        JsonNode first = run(period);
        assertThat(first.path("assetCount").asInt()).isPositive();
        assertThat(first.path("period").asText()).isEqualTo(period);

        JsonNode report = page(REPORTS, "period", period);
        assertThat(report.path("data").path("rows").size()).isEqualTo(1);
        JsonNode row = report.path("data").path("rows").get(0);
        assertThat(row.path("assetCount").asInt()).isEqualTo(first.path("assetCount").asInt());
        assertThat(row.path("operator").asText()).isEqualTo(ADMIN);

        JsonNode details = page(DETAILS, null, null);
        assertThat(details.path("data").path("rows").size())
                .isEqualTo(first.path("assetCount").asInt());

        JsonNode again = run(period);
        assertThat(again.path("assetCount").asInt()).isEqualTo(first.path("assetCount").asInt());
        JsonNode after = page(REPORTS, "period", period);
        assertThat(after.path("data").path("rows").size()).isEqualTo(1);
    }

    @Test
    @DisplayName("期间格式非法返回 422")
    void invalidPeriod() throws Exception {
        mockMvc.perform(auth(post("/api/depreciation/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"period\":\"2026/09\"}")))
                .andExpect(status().isUnprocessableEntity());
    }

    // ------------------------------------------------------------------ 工具

    private JsonNode run(String period) throws Exception {
        String body = mockMvc.perform(auth(post("/api/depreciation/run")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"period\":\"" + period + "\"}")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body).path("data");
    }

    private JsonNode page(String collection, String filter, String value) throws Exception {
        MockHttpServletRequestBuilder builder = auth(get("/api/" + collection + "/page")
                .param("pageSize", "2000"));
        if (filter != null) {
            builder = builder.param(filter, value);
        }
        String body = mockMvc.perform(builder)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return objectMapper.readTree(body);
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

    private static BigDecimal bd(String value) {
        return new BigDecimal(value);
    }
}
