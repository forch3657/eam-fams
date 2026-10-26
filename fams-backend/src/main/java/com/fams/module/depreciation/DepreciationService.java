package com.fams.module.depreciation;

import com.fams.contract.EnumCatalog;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;
import com.fams.security.AuthContext;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 折旧计提服务（契约 5.8）。
 *
 * <p>计提口径：
 * <ul>
 *   <li>范围：{@code fixed-assets.depreciate = true} 的资产；</li>
 *   <li>年限：优先资产自带的 {@code leaseMonths}，否则取折旧规则 / 分类的 {@code usefulLife × 12}；</li>
 *   <li>残值率：优先折旧方案，其次折旧规则，缺省 5%；</li>
 *   <li>方法：优先折旧方案，其次折旧规则，再次资产分类，缺省年限平均法。</li>
 * </ul>
 *
 * <p>产物写入两个集合并汇总一张报表；同一 period 重复计提先清后写，保证幂等。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DepreciationService {

    public static final String ASSETS = "fixed-assets";

    public static final String RULES = "fixed-asset-settings-depreciation-rules";

    public static final String PLANS = "fixed-asset-settings-depreciation-plans";

    public static final String DETAILS = "fixed-asset-report-depreciation-details";

    public static final String PLAN_DETAILS = "fixed-asset-report-depreciation-plan-details";

    public static final String REPORTS = "fixed-asset-depreciation-reports";

    public static final String CATEGORIES = "fixed-asset-settings-categories";

    private static final int DEFAULT_YEARS = DepreciationCalculator.DEFAULT_USEFUL_LIFE_YEARS;

    private final ResourceRegistry registry;

    private final GenericService genericService;

    private final EnumCatalog enumCatalog;

    /** 试算：只计算不落库 */
    @Transactional(readOnly = true)
    public DepreciationResult preview(String period) {
        return calculate(period);
    }

    /** 执行计提：先清空再重写，保证同一 period 幂等 */
    @Transactional
    public DepreciationResult run(String period) {
        DepreciationResult result = calculate(period);

        genericService.clear(DETAILS);
        genericService.clear(PLAN_DETAILS);
        for (Map<String, Object> row : result.getDetails()) {
            genericService.create(DETAILS, row);
        }
        for (Map<String, Object> row : result.getPlanDetails()) {
            genericService.create(PLAN_DETAILS, row);
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("period", result.getPeriod());
        report.put("openingValue", result.getOpeningValue());
        report.put("periodDepreciation", result.getPeriodDepreciation());
        report.put("accumulated", result.getAccumulated());
        report.put("closingNet", result.getClosingNet());
        report.put("assetCount", result.getAssetCount());
        report.put("operator", AuthContext.currentUsername());
        report.put("runDate", LocalDateTime.now());

        Map<String, Object> existing = findReport(result.getPeriod());
        if (existing == null) {
            genericService.create(REPORTS, report);
        } else {
            genericService.update(REPORTS, String.valueOf(existing.get("id")), report);
        }
        return result;
    }

    /** 折旧计划明细：按月份与关键字过滤；month 形如 2026-09 */
    @Transactional(readOnly = true)
    public Map<String, Object> plan(String month, String keyword) {
        String period = month == null ? "" : month.trim();
        String word = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> row : genericService.list(PLAN_DETAILS, Collections.emptyMap())) {
            if (!period.isEmpty() && !textOf(row, "depDate").startsWith(period)) {
                continue;
            }
            if (!word.isEmpty() && !matches(row, word)) {
                continue;
            }
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", rows.size());
        return result;
    }

    private static boolean matches(Map<String, Object> row, String word) {
        String[] fields = {"planName", "assetName", "assetId", "assetType"};
        for (String field : fields) {
            if (textOf(row, field).toLowerCase(Locale.ROOT).contains(word)) {
                return true;
            }
        }
        return false;
    }

    private DepreciationResult calculate(String period) {
        YearMonth ym = DepreciationCalculator.parsePeriod(period);
        LocalDate periodEnd = ym.atEndOfMonth();

        List<Map<String, Object>> assets = genericService.list(ASSETS, Collections.emptyMap());
        List<Map<String, Object>> rules = genericService.list(RULES, Collections.emptyMap());
        List<Map<String, Object>> plans = genericService.list(PLANS, Collections.emptyMap());
        List<Map<String, Object>> categories = genericService.list(CATEGORIES, Collections.emptyMap());

        List<Map<String, Object>> details = new ArrayList<>();
        List<Map<String, Object>> planDetails = new ArrayList<>();
        BigDecimal opening = BigDecimal.ZERO;
        BigDecimal current = BigDecimal.ZERO;
        BigDecimal accumulated = BigDecimal.ZERO;
        BigDecimal closingNet = BigDecimal.ZERO;

        for (Map<String, Object> asset : assets) {
            if (!isDepreciable(asset)) {
                continue;
            }
            Resolution resolution = resolve(asset, rules, plans, categories);
            LocalDate startDate = startDateOf(asset);
            DepreciationLine line = DepreciationCalculator.calculate(
                    resolution.getMethod(), originalOf(asset), resolution.getResidualRate(),
                    resolution.getTotalMonths(), startDate, periodEnd);

            details.add(detailRow(asset, line));
            planDetails.add(planRow(asset, resolution, line, periodEnd));

            opening = opening.add(line.getOpeningNetValue());
            current = current.add(line.getMonthly());
            accumulated = accumulated.add(line.getAccumulated());
            closingNet = closingNet.add(line.getNetValue());
        }

        DepreciationResult result = new DepreciationResult();
        result.setPeriod(ym.toString());
        result.setOpeningValue(scale(opening));
        result.setPeriodDepreciation(scale(current));
        result.setAccumulated(scale(accumulated));
        result.setClosingNet(scale(closingNet));
        result.setAssetCount(details.size());
        result.setDetails(details);
        result.setPlanDetails(planDetails);
        return result;
    }

    /**
     * 解析资产的折旧配置。
     *
     * <p>折旧规则按 {@code name} 是否包含分类中文名匹配；
     * 折旧方案按 {@code assetTypes} 是否包含分类编码匹配，并优先同公司。</p>
     */
    private Resolution resolve(Map<String, Object> asset, List<Map<String, Object>> rules,
                               List<Map<String, Object>> plans, List<Map<String, Object>> categories) {
        String categoryCode = textOf(asset, "category");
        String categoryName = enumCatalog.label("ASSET_CATEGORY", categoryCode);

        Map<String, Object> plan = matchPlan(plans, asset, categoryCode);
        Map<String, Object> rule = matchRule(rules, categoryName);
        Map<String, Object> categoryRow = matchCategory(categories, categoryName);

        BigDecimal residualRate = firstNumber(numberOf(plan, "residualRate"),
                numberOf(rule, "residualRate"), DepreciationCalculator.DEFAULT_RESIDUAL_RATE);
        int years = firstInt(intOf(rule, "usefulLife"), intOf(categoryRow, "usefulLife"), DEFAULT_YEARS);
        String method = pick(textOf(plan, "method"), textOf(rule, "method"),
                textOf(categoryRow, "depreciationMethod"));

        Resolution resolution = new Resolution();
        resolution.setMethod(method);
        resolution.setResidualRate(residualRate);
        resolution.setUsefulLifeYears(years);
        resolution.setTotalMonths(DepreciationCalculator.totalMonths(numberOf(asset, "leaseMonths"), years));
        resolution.setPlanName(textOf(plan, "name"));
        return resolution;
    }

    private static Map<String, Object> matchPlan(List<Map<String, Object>> plans, Map<String, Object> asset,
                                                 String categoryCode) {
        String companyId = textOf(asset, "companyId");
        Map<String, Object> fallback = null;
        for (Map<String, Object> plan : plans) {
            if (!toList(plan.get("assetTypes")).contains(categoryCode)) {
                continue;
            }
            if (companyId.isEmpty() || companyId.equals(textOf(plan, "companyId"))) {
                return plan;
            }
            if (fallback == null) {
                fallback = plan;
            }
        }
        return fallback;
    }

    private static Map<String, Object> matchRule(List<Map<String, Object>> rules, String categoryName) {
        if (categoryName.isEmpty()) {
            return rules.isEmpty() ? null : rules.get(0);
        }
        for (Map<String, Object> rule : rules) {
            String name = textOf(rule, "name");
            if (!name.isEmpty() && (name.contains(categoryName) || categoryName.contains(name))) {
                return rule;
            }
        }
        return null;
    }

    private static Map<String, Object> matchCategory(List<Map<String, Object>> categories, String categoryName) {
        if (categoryName.isEmpty()) {
            return null;
        }
        for (Map<String, Object> row : categories) {
            if (categoryName.equals(textOf(row, "name"))) {
                return row;
            }
        }
        return null;
    }

    private static List<String> toList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        if (raw instanceof Iterable) {
            for (Object item : (Iterable<?>) raw) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
            return out;
        }
        String text = String.valueOf(raw).trim();
        if (text.isEmpty()) {
            return out;
        }
        if (text.startsWith("[")) {
            Object parsed = RowCodec.parseJsonSafe(text);
            if (parsed instanceof Iterable) {
                return toList(parsed);
            }
        }
        out.add(text);
        return out;
    }

    /** 是否参与计提 */
    private static boolean isDepreciable(Map<String, Object> asset) {
        Object flag = asset.get("depreciate");
        if (flag instanceof Boolean) {
            return (Boolean) flag;
        }
        if (flag instanceof Number) {
            return ((Number) flag).intValue() != 0;
        }
        if (flag instanceof String) {
            String text = ((String) flag).trim();
            return "true".equalsIgnoreCase(text) || "1".equals(text) || "Y".equalsIgnoreCase(text);
        }
        return false;
    }

    private static BigDecimal originalOf(Map<String, Object> asset) {
        BigDecimal original = numberOf(asset, "original");
        if (original != null && original.signum() != 0) {
            return original;
        }
        BigDecimal amount = numberOf(asset, "amount");
        return amount == null ? BigDecimal.ZERO : amount;
    }

    /** 起算日期：优先入账日期，其次采购日期 */
    private static LocalDate startDateOf(Map<String, Object> asset) {
        LocalDate inbound = DepreciationCalculator.toLocalDate(asset.get("inboundDate"));
        return inbound == null ? DepreciationCalculator.toLocalDate(asset.get("purchaseDate")) : inbound;
    }

    /** 取该 period 已有的报表行（用于重复计提时覆盖） */
    private Map<String, Object> findReport(String period) {
        for (Map<String, Object> row : genericService.list(REPORTS, Collections.emptyMap())) {
            if (period.equals(textOf(row, "period"))) {
                return row;
            }
        }
        return null;
    }

    private static String pick(String... candidates) {
        for (String value : candidates) {
            if (value != null && !value.trim().isEmpty()) {
                return value;
            }
        }
        return DepreciationCalculator.STRAIGHT_LINE;
    }

    private static BigDecimal firstNumber(BigDecimal... candidates) {
        for (BigDecimal value : candidates) {
            if (value != null) {
                return value;
            }
        }
        return DepreciationCalculator.DEFAULT_RESIDUAL_RATE;
    }

    private static int firstInt(Integer... candidates) {
        for (Integer value : candidates) {
            if (value != null) {
                return value;
            }
        }
        return DEFAULT_YEARS;
    }

    private static String textOf(Map<String, Object> row, String field) {
        if (row == null) {
            return "";
        }
        Object value = row.get(field);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static BigDecimal numberOf(Map<String, Object> row, String field) {
        if (row == null) {
            return null;
        }
        return RowCodec.toBigDecimal(row.get(field));
    }

    private static Integer intOf(Map<String, Object> row, String field) {
        BigDecimal value = numberOf(row, field);
        return value == null ? null : value.intValue();
    }

    private static BigDecimal scale(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value.setScale(2, RoundingMode.HALF_UP);
    }

    /** 折旧明细行：写入 fixed-asset-report-depreciation-details */
    private static Map<String, Object> detailRow(Map<String, Object> asset, DepreciationLine line) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("assetId", asset.get("id"));
        row.put("name", asset.get("name"));
        row.put("originalValue", line.getOriginalValue());
        row.put("depreciationMethod", line.getMethod());
        row.put("usefulLife", line.getTotalMonths());
        row.put("accumulatedDepreciation", line.getAccumulated());
        row.put("netValue", line.getNetValue());
        row.put("depreciationRate", line.getRate());
        row.put("purchaseDate", asset.get("purchaseDate"));
        return row;
    }

    /** 折旧计划明细行：写入 fixed-asset-report-depreciation-plan-details */
    private static Map<String, Object> planRow(Map<String, Object> asset, Resolution resolution,
                                               DepreciationLine line, LocalDate periodEnd) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("planName", resolution.getPlanName());
        row.put("assetId", asset.get("id"));
        row.put("assetName", asset.get("name"));
        row.put("assetType", asset.get("category"));
        row.put("companyId", asset.get("companyId"));
        row.put("original", line.getOriginalValue());
        row.put("residualRate", line.getResidualRate());
        row.put("totalLife", line.getTotalMonths());
        row.put("usedLife", line.getUsedMonths());
        row.put("depDate", periodEnd.withDayOfMonth(1));
        row.put("finished", line.isFinished());
        return row;
    }

    /** 折旧配置解析结果 */
    @Data
    public static final class Resolution {

        private String method = DepreciationCalculator.STRAIGHT_LINE;

        private BigDecimal residualRate = DepreciationCalculator.DEFAULT_RESIDUAL_RATE;

        private int usefulLifeYears = DEFAULT_YEARS;

        private int totalMonths = DEFAULT_YEARS * 12;

        private String planName = "";

        private String flowId = "";
    }
}
