package com.fams.module.depreciation;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.regex.Pattern;

/**
 * 固定资产折旧计算（契约 5.8 折旧管理）。
 *
 * <p>四种方法：</p>
 * <ol>
 *   <li>{@code STRAIGHT_LINE} 年限平均法：月折旧额 = 应计提总额 / 总月数</li>
 *   <li>{@code DOUBLE_DECLINE} 双倍余额递减法：前 n−2 年按 2/n 折旧率计提，最后两年改为直线法</li>
 *   <li>{@code SUM_YEARS} 年数总和法：第 k 年按 (n−k+1)/Σ 分摊</li>
 *   <li>{@code WORKLOAD} 工作量法：以「已用月数 / 总月数」为工作量进度口径
 *       —— 契约未提供「预计总工作量 / 本期工作量」字段，故以时间进度替代</li>
 * </ol>
 *
 * <p>四种方法共用同一上限：应计提折旧总额 = 原值 ×(1 − 残值率)。
 * 最后一期用倒挤法吸收尾差，保证累计折旧恰好收敛到应计提总额、净值恰好收敛到残值。</p>
 */
public final class DepreciationCalculator {

    public static final String STRAIGHT_LINE = "STRAIGHT_LINE";

    public static final String DOUBLE_DECLINE = "DOUBLE_DECLINE";

    public static final String SUM_YEARS = "SUM_YEARS";

    public static final String WORKLOAD = "WORKLOAD";

    public static final int DEFAULT_USEFUL_LIFE_YEARS = 5;

    public static final BigDecimal DEFAULT_RESIDUAL_RATE = new BigDecimal("5");

    private static final int MONTHS_OF_YEAR = 12;

    private static final int MONEY_SCALE = 2;

    /** 中间计算精度，最终金额统一保留 2 位 */
    private static final int CALC_SCALE = 12;

    private static final Pattern PERIOD = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private static final BigDecimal ONE = BigDecimal.ONE;

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private static final BigDecimal TWELVE = BigDecimal.valueOf(MONTHS_OF_YEAR);

    private DepreciationCalculator() {
    }

    /** 折旧总月数：优先资产自带的折旧/租赁月数，其次年限 × 12 */
    public static int totalMonths(BigDecimal leaseMonths, int usefulLifeYears) {
        if (leaseMonths != null && leaseMonths.signum() > 0) {
            return leaseMonths.setScale(0, RoundingMode.HALF_UP).intValue();
        }
        int years = usefulLifeYears > 0 ? usefulLifeYears : DEFAULT_USEFUL_LIFE_YEARS;
        return years * MONTHS_OF_YEAR;
    }

    /**
     * 已计提月数：按「当月增加、次月计提」口径，
     * 即两个日期所在月份的差值；不足 0 按 0 计。
     */
    public static int usedMonths(LocalDate startDate, LocalDate periodEnd) {
        if (startDate == null || periodEnd == null) {
            return 0;
        }
        long months = ChronoUnit.MONTHS.between(
                YearMonth.from(startDate).atDay(1),
                YearMonth.from(periodEnd).atDay(1));
        return (int) Math.max(0, months);
    }

    /** 应计提折旧总额 = 原值 ×(1 − 残值率%) */
    public static BigDecimal depreciableAmount(BigDecimal original, BigDecimal residualRatePct) {
        BigDecimal rate = residualRatePct == null ? DEFAULT_RESIDUAL_RATE : residualRatePct;
        BigDecimal amount = nz(original).multiply(ONE.subtract(div(rate, HUNDRED)));
        return round(amount.signum() > 0 ? amount : ZERO);
    }

    /** 解析期间字符串（yyyy-MM）；非法时抛 422 */
    public static YearMonth parsePeriod(String period) {
        if (period == null || !PERIOD.matcher(period.trim()).matches()) {
            throw new ApiException(ErrorCode.VALIDATION, "计提期间格式应为 yyyy-MM，例如 2026-09");
        }
        return YearMonth.parse(period.trim());
    }

    /** 把任意来源的时间值（String / Date / LocalDateTime / LocalDate）规约为日期 */
    public static LocalDate toLocalDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate) {
            return (LocalDate) value;
        }
        if (value instanceof LocalDateTime) {
            return ((LocalDateTime) value).toLocalDate();
        }
        if (value instanceof java.sql.Timestamp) {
            return ((java.sql.Timestamp) value).toLocalDateTime().toLocalDate();
        }
        if (value instanceof java.util.Date) {
            return ((java.util.Date) value).toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        String text = value.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // 继续尝试纯日期写法
        }
        try {
            return LocalDate.parse(text, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException e) {
            throw new ApiException(ErrorCode.VALIDATION, "时间格式应为 ISO 8601：" + text);
        }
    }

    /**
     * 计算单条资产在某个期间的折旧。
     *
     * @param method          折旧方法编码（见 DEPRECIATION_METHOD）
     * @param original        资产原值
     * @param residualRatePct 残值率（百分数，5 表示 5%）
     * @param totalMonths     折旧总月数
     * @param startDate       起算日期（采购日期 / 入账日期）
     * @param periodEnd       计提所属期间的结束日（一般为该月最后一天）
     */
    public static DepreciationLine calculate(String method, BigDecimal original, BigDecimal residualRatePct,
                                             int totalMonths, LocalDate startDate, LocalDate periodEnd) {
        String resolved = normalize(method);
        BigDecimal amount = nz(original);
        BigDecimal rate = residualRatePct == null ? DEFAULT_RESIDUAL_RATE : residualRatePct;
        int years = yearsOf(totalMonths);
        int life = years * MONTHS_OF_YEAR;

        BigDecimal cap = depreciableAmount(amount, rate);
        BigDecimal salvage = amount.subtract(cap);
        int used = Math.min(usedMonths(startDate, periodEnd), life);
        BigDecimal[] yearly = yearlySchedule(resolved, amount, cap, salvage, years);
        BigDecimal monthly = used >= life ? ZERO : round(div(yearly[used / MONTHS_OF_YEAR], TWELVE));

        return new DepreciationLine(resolved, amount, rate, years, life, used, monthly, cap, salvage, yearly);
    }

    /** 逐年折旧额；最后一年倒挤，吸收前面各年的取整尾差 */
    public static BigDecimal[] yearlySchedule(String method, BigDecimal original, BigDecimal cap,
                                              BigDecimal salvage, int years) {
        BigDecimal[] schedule = new BigDecimal[Math.max(1, years)];
        BigDecimal rate = div(BigDecimal.valueOf(2), BigDecimal.valueOf(years));
        BigDecimal book = original;
        for (int k = 1; k <= years; k++) {
            BigDecimal limit = max(ZERO, book.subtract(salvage));
            BigDecimal dep;
            if (DOUBLE_DECLINE.equals(method)) {
                // 最后两年改直线法：剩余应提额在剩余年限内平均
                dep = k >= years - 1
                        ? div(limit, BigDecimal.valueOf(years - k + 1))
                        : min(book.multiply(rate), limit);
            } else if (SUM_YEARS.equals(method)) {
                int sum = years * (years + 1) / 2;
                dep = div(cap.multiply(BigDecimal.valueOf(years - k + 1)), BigDecimal.valueOf(sum));
            } else {
                // 年限平均法；工作量法按时间进度等额
                dep = div(cap, BigDecimal.valueOf(years));
            }
            schedule[k - 1] = max(ZERO, min(dep, limit));
            book = book.subtract(schedule[k - 1]);
        }
        return schedule;
    }

    /** 月数 → 年限（向上取整，至少 1 年） */
    private static int yearsOf(int totalMonths) {
        return Math.max(1, (int) Math.ceil(totalMonths / (double) MONTHS_OF_YEAR));
    }

    private static String normalize(String method) {
        if (DOUBLE_DECLINE.equals(method) || SUM_YEARS.equals(method) || WORKLOAD.equals(method)) {
            return method;
        }
        return STRAIGHT_LINE;
    }

    private static BigDecimal div(BigDecimal a, BigDecimal b) {
        if (b.signum() == 0) {
            return ZERO;
        }
        return a.divide(b, CALC_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal round(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal min(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) <= 0 ? a : b;
    }

    private static BigDecimal max(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? ZERO : value;
    }
}
