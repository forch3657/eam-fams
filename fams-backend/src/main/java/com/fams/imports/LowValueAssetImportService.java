package com.fams.imports;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.EnumCatalog;
import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 低值资产单表导入：客户只维护一张「低值物品台账」表，一行 = 一个物品，
 * 系统内部落到 {@code low-value-items}；存放位置按名称自动建档。
 *
 * <p>库存口径（产品确认）：期初库存<b>直接写入台账</b>，不生成入库单。
 * 因此「入库管理」与「出入库汇总」不包含这批期初库存；后续出入库仍走单据流程，
 * 由引擎按单据状态联动 {@code stock}。</p>
 *
 * <p>领用 / 退库属于审批单据，涉及部门人员与可退额度，不在本表范围内。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LowValueAssetImportService {

    public static final String ITEMS = "low-value-items";
    public static final String LOCATIONS = "low-value-settings-locations";

    private static final String CATEGORY_ENUM = "LOW_VALUE_CATEGORY";
    private static final String ITEM_STATUS_ENUM = "LOW_VALUE_ITEM_STATUS";

    private static final String DEFAULT_PREFIX = "DZ";
    private static final String CODE_PREFIX_PARAM = "sys.lowvalue.code.prefix";
    private static final String LOCATION_CODE_PREFIX = "WZ-";
    private static final String ITEM_KEY_SEP = "\u0000";

    // ---------------------------------------------------------------- 单表列定义

    public static final String COL_CATEGORY = "物品类别";
    public static final String COL_NAME = "物品名称";
    public static final String COL_SPEC = "规格型号";
    public static final String COL_UNIT = "单位";
    public static final String COL_PRICE = "物品单价";
    public static final String COL_STOCK = "期初库存";
    public static final String COL_SAFETY = "安全库存";
    public static final String COL_LOCATION = "存放位置";
    public static final String COL_STATUS = "状态";
    public static final String COL_CODE = "物品编码";

    /** 模板列顺序（也是校验时的必备列清单） */
    public static final List<String> COLUMNS = Collections.unmodifiableList(Arrays.asList(
            COL_CATEGORY, COL_NAME, COL_SPEC, COL_UNIT, COL_PRICE,
            COL_STOCK, COL_SAFETY, COL_LOCATION, COL_STATUS, COL_CODE));

    private static final String[] COLUMN_NOTES = {
            "物品类别，必填；填类别名称（办公用品/水/劳保用品/纸品）或编码（OFFICE/WATER/PPE/PAPER）",
            "物品名称，必填",
            "规格型号，选填",
            "单位，必填；如 包/个/箱",
            "物品单价，选填；默认 0，最多两位小数",
            "期初库存，选填；直接写入台账库存，不生成入库单；重复导入不会重复累加",
            "安全库存，选填；默认 0，用于低库存预警",
            "存放位置，选填；填位置名称，不存在时自动创建",
            "状态，选填；默认 正常，可选 正常/低库存/停用 或 NORMAL/LOW_STOCK/DISABLED",
            "物品编码，选填；留空自动生成 DZ20260001 形式"
    };

    private static final String[] COLUMN_SAMPLES = {
            "办公用品", "A4 打印纸", "70g/500张", "包", "25.00",
            "100", "20", "行政库房", "正常", ""
    };

    private final ImportFileParser fileParser;
    private final GenericService genericService;
    private final EnumCatalog enumCatalog;
    private final PlatformTransactionManager transactionManager;

    // ---------------------------------------------------------------- 模板

    /**
     * 生成低值资产单表模板（CSV）：第 1 行中文表头、第 2 行 {@code #说明}、第 3 行 {@code #示例}，
     * 后两行导入时自动跳过。
     */
    public String templateCsv() {
        StringBuilder header = new StringBuilder();
        StringBuilder note = new StringBuilder();
        StringBuilder sample = new StringBuilder();
        for (int i = 0; i < COLUMNS.size(); i++) {
            if (i > 0) {
                header.append(',');
                note.append(',');
                sample.append(',');
            }
            header.append(csvCell(COLUMNS.get(i)));
            note.append(i == 0 ? "#说明 " + csvCell(COLUMN_NOTES[i]) : csvCell(COLUMN_NOTES[i]));
            sample.append(i == 0 ? "#示例 " + csvCell(COLUMN_SAMPLES[i]) : csvCell(COLUMN_SAMPLES[i]));
        }
        return header + "\n" + note + "\n" + sample + "\n";
    }

    // ---------------------------------------------------------------- 导入

    /**
     * 单表导入。
     *
     * @param abortOnError true：任一行不合法则整批拒绝、零写入；写入阶段异常则整体回滚
     * @param abortOnError false：逐行尝试（物品与其自动创建的存放位置在同一事务内，互不残留）
     */
    public LowValueImportResult doImport(MultipartFile file, boolean abortOnError) throws IOException {
        List<ImportFileParser.ParsedRow> rows = fileParser.parse(file);
        LowValueImportResult result = new LowValueImportResult();
        result.total = rows.size();

        if (rows.isEmpty()) {
            result.failures.add(new LowValueImportResult.Failure(1,
                    "文件中没有可导入的数据行；表头需为：" + String.join("/", COLUMNS)));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        List<String> missing = missingColumns(rows.get(0));
        if (!missing.isEmpty()) {
            result.failures.add(new LowValueImportResult.Failure(1,
                    "模板缺少列：「" + String.join("」「", missing) + "」，请下载最新模板后重试"));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        Index index = loadIndex();
        List<ItemRow> parsed = new ArrayList<>(rows.size());
        Set<String> fileKeys = new HashSet<>();
        for (ImportFileParser.ParsedRow raw : rows) {
            try {
                parsed.add(toItemRow(raw, fileKeys));
            } catch (ApiException e) {
                result.failures.add(new LowValueImportResult.Failure(raw.line, e.getMessage()));
                log.warn("低值资产导入校验失败：第 {} 行 - {}", raw.line, e.getMessage());
            }
        }

        if (abortOnError && !result.failures.isEmpty()) {
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        if (abortOnError) {
            try {
                new TransactionTemplate(transactionManager)
                        .executeWithoutResult(status -> writeAll(parsed, result, index, true));
            } catch (RowFailure e) {
                resetCounters(result);
                result.failures.add(new LowValueImportResult.Failure(e.line, e.message));
                result.status = Status.REJECTED_INVALID;
                log.warn("低值资产导入整体回滚：第 {} 行 - {}", e.line, e.message);
                return result;
            }
        } else {
            // 逐行模式：每行单独事务，保证「自动补的位置 + 物品」要么都在、要么都不在
            TransactionTemplate perRow = new TransactionTemplate(transactionManager);
            for (ItemRow row : parsed) {
                if (row.invalid) {
                    continue;
                }
                try {
                    perRow.executeWithoutResult(status -> writeRow(row, result, index, false));
                } catch (RowFailure e) {
                    result.failures.add(new LowValueImportResult.Failure(e.line, e.message));
                }
            }
        }

        boolean wroteSomething = result.createdItems + result.reusedItems > 0;
        if (result.failures.isEmpty()) {
            result.status = Status.OK;
        } else {
            result.status = wroteSomething ? Status.PARTIAL : Status.FAILED;
        }
        return result;
    }

    private void writeAll(List<ItemRow> rows, LowValueImportResult result, Index index, boolean abort) {
        for (ItemRow row : rows) {
            if (row.invalid) {
                continue;
            }
            writeRow(row, result, index, abort);
        }
    }

    /** 写入一行：按业务键判断复用；新建时直接把期初库存写入台账 */
    private void writeRow(ItemRow row, LowValueImportResult result, Index index, boolean abort) {
        Map<String, Object> existing = reuseItem(row, index);
        if (existing != null) {
            // 幂等：已存在的物品不改库存/单价/状态，避免重复导入把账改乱
            result.reusedItems++;
            log.info("低值资产导入：物品「{}」已存在，按复用处理（期初库存 {} 未重复累加）", row.name, row.stock);
            return;
        }

        String locationName = null;
        if (!row.location.isEmpty()) {
            locationName = ensureLocation(row, result, index, abort);
            if (locationName == null) {
                return; // 位置创建失败，该行已记录失败
            }
        }

        String code = row.code.isEmpty() ? autoItemCode(index) : row.code;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("category", row.category);
        body.put("name", row.name);
        body.put("spec", row.spec);
        body.put("unit", row.unit);
        body.put("price", row.price);
        body.put("stock", row.stock);
        body.put("safetyStock", row.safetyStock);
        body.put("status", row.status);
        if (locationName != null) {
            body.put("location", locationName);
        }
        try {
            Map<String, Object> saved = genericService.create(ITEMS, body);
            index.remember(saved);
            result.createdItems++;
        } catch (ApiException e) {
            fail(row, "新建物品失败：" + e.getMessage(), result, abort);
        }
    }

    /** 按编码优先、其次「名称+规格+单位」匹配已有物品（客户无需填写任何主键） */
    private Map<String, Object> reuseItem(ItemRow row, Index index) {
        if (!row.code.isEmpty()) {
            return index.itemsByCode.get(row.code);
        }
        return index.itemsByKey.get(itemKey(row.name, row.spec, row.unit));
    }

    /** 存放位置按名称匹配，不存在则自动建档（位置是基础数据，避免导入被卡住） */
    private String ensureLocation(ItemRow row, LowValueImportResult result, Index index, boolean abort) {
        if (index.locationNames.contains(row.location)) {
            return row.location;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", autoLocationCode(index));
        body.put("name", row.location);
        body.put("status", "ENABLED");
        try {
            Map<String, Object> saved = genericService.create(LOCATIONS, body);
            index.locationNames.add(row.location);
            index.locationCodes.add(str(saved.get("code")));
            result.createdLocations++;
            return row.location;
        } catch (ApiException e) {
            fail(row, "创建存放位置「" + row.location + "」失败：" + e.getMessage(), result, abort);
            return null;
        }
    }

    // ---------------------------------------------------------------- 行解析与校验

    private ItemRow toItemRow(ImportFileParser.ParsedRow raw, Set<String> fileKeys) {
        ItemRow row = new ItemRow();
        row.line = raw.line;

        String categoryInput = value(raw, COL_CATEGORY);
        if (categoryInput.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "物品类别不能为空");
        }
        row.category = resolveEnum(CATEGORY_ENUM, categoryInput);
        if (row.category == null) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "物品类别「" + categoryInput + "」不合法，可选值：" + describeEnum(CATEGORY_ENUM));
        }

        row.name = value(raw, COL_NAME);
        if (row.name.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "物品名称不能为空");
        }
        row.unit = value(raw, COL_UNIT);
        if (row.unit.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "单位不能为空（如 包/个/箱）");
        }

        row.spec = value(raw, COL_SPEC);
        row.price = decimal(value(raw, COL_PRICE), "物品单价", false);
        row.stock = decimal(value(raw, COL_STOCK), "期初库存", true);
        row.safetyStock = decimal(value(raw, COL_SAFETY), "安全库存", true);

        String statusInput = value(raw, COL_STATUS);
        row.status = statusInput.isEmpty() ? "NORMAL" : resolveEnum(ITEM_STATUS_ENUM, statusInput);
        if (row.status == null) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "状态「" + statusInput + "」不合法，可选值：" + describeEnum(ITEM_STATUS_ENUM));
        }

        row.location = value(raw, COL_LOCATION);
        row.code = value(raw, COL_CODE);

        // 同一文件里同一物品只能出现一行，否则「库存到底以哪行为准」说不清
        String key = row.code.isEmpty() ? itemKey(row.name, row.spec, row.unit) : "CODE" + ITEM_KEY_SEP + row.code;
        if (!fileKeys.add(key)) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "物品「" + row.name + "」在文件中重复出现（同一物品只能有一行；追加库存请走「入库管理」）");
        }
        return row;
    }

    private BigDecimal decimal(String text, String label, boolean integerOnly) {
        if (text == null || text.trim().isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal value;
        try {
            value = new BigDecimal(text.trim().replace(",", ""));
        } catch (NumberFormatException e) {
            throw new ApiException(ErrorCode.VALIDATION, label + "应为数字：" + text);
        }
        if (value.signum() < 0) {
            throw new ApiException(ErrorCode.VALIDATION, label + "不能为负数：" + text);
        }
        if (integerOnly && value.stripTrailingZeros().scale() > 0) {
            throw new ApiException(ErrorCode.VALIDATION, label + "必须为整数：" + text);
        }
        if (value.scale() > 2) {
            throw new ApiException(ErrorCode.VALIDATION, label + "最多保留两位小数：" + text);
        }
        return value;
    }

    /** 枚举：编码或中文名称都能匹配（业务人员填「办公用品」即可） */
    private String resolveEnum(String enumName, String input) {
        String text = input.trim();
        for (String code : enumCatalog.allowed(enumName)) {
            if (code.equalsIgnoreCase(text) || enumCatalog.label(enumName, code).equals(text)) {
                return code;
            }
        }
        return null;
    }

    private String describeEnum(String enumName) {
        List<String> parts = new ArrayList<>();
        for (String code : enumCatalog.allowed(enumName)) {
            parts.add(enumCatalog.label(enumName, code) + "(" + code + ")");
        }
        return String.join("/", parts);
    }

    private static List<String> missingColumns(ImportFileParser.ParsedRow first) {
        List<String> missing = new ArrayList<>();
        for (String column : COLUMNS) {
            if (!first.values.containsKey(column)) {
                missing.add(column);
            }
        }
        return missing;
    }

    private static String value(ImportFileParser.ParsedRow row, String column) {
        String v = row.values.get(column);
        return v == null ? "" : v.trim();
    }

    // ---------------------------------------------------------------- 索引与编码

    /**
     * 预加载索引：物品（编码 / 名称+规格+单位）、存放位置、物品编码前缀。
     * 一次性查库，避免逐行 N+1。
     */
    private Index loadIndex() {
        Index index = new Index();
        for (Map<String, Object> row : genericService.list(ITEMS, new HashMap<String, String[]>())) {
            index.remember(row);
        }
        for (Map<String, Object> row : genericService.list(LOCATIONS, new HashMap<String, String[]>())) {
            String name = str(row.get("name"));
            if (!name.isEmpty()) {
                index.locationNames.add(name);
            }
            String code = str(row.get("code"));
            if (!code.isEmpty()) {
                index.locationCodes.add(code);
            }
        }
        index.codePrefix = itemCodePrefix();
        return index;
    }

    /** 物品编码前缀取自系统参数 sys.lowvalue.code.prefix（与界面新增物品一致） */
    private String itemCodePrefix() {
        try {
            for (Map<String, Object> row : genericService.list("system-params", new HashMap<String, String[]>())) {
                if (CODE_PREFIX_PARAM.equals(str(row.get("key"))) && !str(row.get("value")).isEmpty()) {
                    return str(row.get("value"));
                }
            }
        } catch (RuntimeException e) {
            log.debug("读取低值物品编码前缀失败，使用默认值 {}", DEFAULT_PREFIX, e);
        }
        return DEFAULT_PREFIX;
    }

    private static String autoItemCode(Index index) {
        String prefix = index.codePrefix + LocalDate.now().getYear();
        int n = index.itemsByCode.size() + 1;
        String code;
        do {
            code = prefix + String.format("%04d", n++);
        } while (index.itemsByCode.containsKey(code));
        return code;
    }

    private static String autoLocationCode(Index index) {
        int n = index.locationCodes.size() + 1;
        String code;
        do {
            code = LOCATION_CODE_PREFIX + String.format("%04d", n++);
        } while (index.locationCodes.contains(code));
        return code;
    }

    private static String itemKey(String name, String spec, String unit) {
        return (name + ITEM_KEY_SEP + spec + ITEM_KEY_SEP + unit).toLowerCase(Locale.ROOT);
    }

    // ---------------------------------------------------------------- 工具

    private void fail(ItemRow row, String message, LowValueImportResult result, boolean abort) {
        row.invalid = true;
        log.warn("低值资产导入失败：第 {} 行 - {}", row.line, message);
        if (abort) {
            throw new RowFailure(row.line, message);
        }
        result.failures.add(new LowValueImportResult.Failure(row.line, message));
    }

    private static void resetCounters(LowValueImportResult result) {
        result.createdItems = 0;
        result.reusedItems = 0;
        result.createdLocations = 0;
    }

    private static String str(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String csvCell(String v) {
        if (v == null || v.isEmpty()) {
            return "";
        }
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    // ---------------------------------------------------------------- 内部类型

    /** 导入结果状态 */
    public static final class Status {
        public static final String OK = "OK";
        public static final String PARTIAL = "PARTIAL";
        public static final String FAILED = "FAILED";
        public static final String REJECTED_INVALID = "REJECTED_INVALID";

        private Status() {
        }
    }

    /** 一行解析后的结构化数据 */
    private static final class ItemRow {
        int line;
        String category = "";
        String name = "";
        String spec = "";
        String unit = "";
        BigDecimal price = BigDecimal.ZERO;
        BigDecimal stock = BigDecimal.ZERO;
        BigDecimal safetyStock = BigDecimal.ZERO;
        String location = "";
        String status = "NORMAL";
        String code = "";
        boolean invalid;
    }

    /** 预加载索引（一次查库，全量内存匹配） */
    private static final class Index {
        final Map<String, Map<String, Object>> itemsByCode = new LinkedHashMap<>();
        final Map<String, Map<String, Object>> itemsByKey = new LinkedHashMap<>();
        final Set<String> locationNames = new LinkedHashSet<>();
        final Set<String> locationCodes = new LinkedHashSet<>();
        String codePrefix = DEFAULT_PREFIX;

        void remember(Map<String, Object> row) {
            String code = str(row.get("code"));
            if (!code.isEmpty()) {
                itemsByCode.put(code, row);
            }
            itemsByKey.put(itemKey(str(row.get("name")), str(row.get("spec")), str(row.get("unit"))), row);
        }
    }

    /** 整批模式的内部回滚信号 */
    private static final class RowFailure extends RuntimeException {
        final int line;
        final String message;

        RowFailure(int line, String message) {
            super(message, null, false, false);
            this.line = line;
            this.message = message;
        }
    }

    // ---------------------------------------------------------------- DTO

    /** 分级结果报告：新建/复用统计 + 失败明细（带行号） */
    public static class LowValueImportResult {
        public int total;
        public int createdItems;
        public int reusedItems;
        public int createdLocations;
        public String status;
        public List<Failure> failures = new ArrayList<>();

        public static class Failure {
            public int row;
            public String message;

            public Failure(int row, String message) {
                this.row = row;
                this.message = message;
            }
        }
    }
}
