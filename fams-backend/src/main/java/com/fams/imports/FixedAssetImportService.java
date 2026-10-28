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
import java.time.format.DateTimeFormatter;
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
 * 固定资产单表导入：客户只维护一张「固定资产台账」表，一行 = 一张资产卡片，
 * 系统内部落到 {@code fixed-assets}；公司/部门/使用人按名称自动匹配，存放地点不存在时自动建档。
 *
 * <p>与低值资产的关键差异：固定资产是<b>一物一码</b>，同名同型号可以有多台，
 * 因此只按「资产编号」做幂等判断，绝不做名称去重；编号已存在时按复用处理，不覆盖原有数据。</p>
 *
 * <p>入库 / 派发 / 借出 / 维修 / 调拨 / 处置属于业务单据，不在本表范围内。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FixedAssetImportService {

    public static final String ASSETS = "fixed-assets";
    public static final String LOCATIONS = "fixed-asset-settings-locations";

    private static final String CATEGORY_ENUM = "ASSET_CATEGORY";
    private static final String STATUS_ENUM = "ASSET_STATUS";
    private static final String PURCHASE_MODE_ENUM = "PURCHASE_MODE";

    private static final String DEFAULT_PREFIX = "GD";
    private static final String CODE_PREFIX_PARAM = "sys.asset.code.prefix";
    private static final String LOCATION_CODE_PREFIX = "LOC-";
    private static final String IDLE = "IDLE";
    private static final String KEY_SEP = "\u0000";

    // ---------------------------------------------------------------- 单表列定义

    public static final String COL_NAME = "资产名称";
    public static final String COL_CATEGORY = "资产分类";
    public static final String COL_CODE = "资产编号";
    public static final String COL_BRAND = "品牌";
    public static final String COL_MODEL = "规格型号";
    public static final String COL_COMPANY = "所属公司";
    public static final String COL_DEPT = "使用部门";
    public static final String COL_USER = "使用人";
    public static final String COL_LOCATION = "存放地点";
    public static final String COL_PURCHASE_DATE = "购置日期";
    public static final String COL_AMOUNT = "购置金额";
    public static final String COL_ORIGINAL = "资产原值";
    public static final String COL_NET = "净值";
    public static final String COL_PURCHASE_MODE = "购置方式";
    public static final String COL_STATUS = "状态";
    public static final String COL_DEPRECIATE = "是否计提折旧";

    /** 模板列顺序（也是校验时的必备列清单） */
    public static final List<String> COLUMNS = Collections.unmodifiableList(Arrays.asList(
            COL_NAME, COL_CATEGORY, COL_CODE, COL_BRAND, COL_MODEL, COL_COMPANY, COL_DEPT, COL_USER,
            COL_LOCATION, COL_PURCHASE_DATE, COL_AMOUNT, COL_ORIGINAL, COL_NET,
            COL_PURCHASE_MODE, COL_STATUS, COL_DEPRECIATE));

    private static final String[] COLUMN_NOTES = {
            "资产名称，必填",
            "资产分类，必填；填名称（电子设备/机械设备/运输设备/办公家具/房屋建筑物/办公用品/材料/其他设备）或编码",
            "资产编号，选填；留空自动生成 GD20260001 形式；填写时按编号判重，已存在只复用不覆盖",
            "品牌，选填",
            "规格型号，选填",
            "所属公司，选填；填公司名称，须已在组织架构中维护",
            "使用部门，选填；填部门名称；填写公司时须属于该公司",
            "使用人，选填；填姓名或登录账号；同名时请改填登录账号",
            "存放地点，选填；填名称，不存在时自动创建",
            "购置日期，选填；yyyy-MM-dd",
            "购置金额，选填；默认 0，最多两位小数",
            "资产原值，选填；留空取购置金额",
            "净值，选填；留空取资产原值",
            "购置方式，选填；默认 购买，可选 购买/租赁/自建/受赠",
            "状态，选填；默认 空闲，可选 空闲/使用中/派发中/借出中/维修中/处置中",
            "是否计提折旧，选填；默认 是，可选 是/否"
    };

    private static final String[] COLUMN_SAMPLES = {
            "联想ThinkPad笔记本电脑", "电子设备", "", "联想", "ThinkPad T14",
            "华信科技集团有限公司", "技术部", "张三", "总部办公楼2层", "2026-03-12",
            "8500", "8500", "7650", "购买", "空闲", "是"
    };

    private final ImportFileParser fileParser;
    private final GenericService genericService;
    private final EnumCatalog enumCatalog;
    private final PlatformTransactionManager transactionManager;

    // ---------------------------------------------------------------- 模板

    /**
     * 生成固定资产单表模板（CSV）：第 1 行中文表头、第 2 行 {@code #说明}、第 3 行 {@code #示例}，
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
     * @param abortOnError false：逐行尝试（资产与其自动创建的存放地点在同一事务内，互不残留）
     */
    public FixedAssetImportResult doImport(MultipartFile file, boolean abortOnError) throws IOException {
        List<ImportFileParser.ParsedRow> rows = fileParser.parse(file);
        FixedAssetImportResult result = new FixedAssetImportResult();
        result.total = rows.size();

        if (rows.isEmpty()) {
            result.failures.add(new FixedAssetImportResult.Failure(1,
                    "文件中没有可导入的数据行；表头需为：" + String.join("/", COLUMNS)));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        List<String> missing = missingColumns(rows.get(0));
        if (!missing.isEmpty()) {
            result.failures.add(new FixedAssetImportResult.Failure(1,
                    "模板缺少列：「" + String.join("」「", missing) + "」，请下载最新模板后重试"));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        Index index = loadIndex();
        List<AssetRow> parsed = new ArrayList<>(rows.size());
        Set<String> fileCodes = new HashSet<>();
        for (ImportFileParser.ParsedRow raw : rows) {
            try {
                parsed.add(toAssetRow(raw, index, fileCodes));
            } catch (ApiException e) {
                result.failures.add(new FixedAssetImportResult.Failure(raw.line, e.getMessage()));
                log.warn("固定资产导入校验失败：第 {} 行 - {}", raw.line, e.getMessage());
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
                result.failures.add(new FixedAssetImportResult.Failure(e.line, e.message));
                result.status = Status.REJECTED_INVALID;
                log.warn("固定资产导入整体回滚：第 {} 行 - {}", e.line, e.message);
                return result;
            }
        } else {
            // 逐行模式：每行单独事务，保证「自动补的地点 + 资产」要么都在、要么都不在
            TransactionTemplate perRow = new TransactionTemplate(transactionManager);
            for (AssetRow row : parsed) {
                if (row.invalid) {
                    continue;
                }
                try {
                    perRow.executeWithoutResult(status -> writeRow(row, result, index, false));
                } catch (RowFailure e) {
                    result.failures.add(new FixedAssetImportResult.Failure(e.line, e.message));
                }
            }
        }

        boolean wroteSomething = result.createdAssets + result.reusedAssets > 0;
        if (result.failures.isEmpty()) {
            result.status = Status.OK;
        } else {
            result.status = wroteSomething ? Status.PARTIAL : Status.FAILED;
        }
        return result;
    }

    private void writeAll(List<AssetRow> rows, FixedAssetImportResult result, Index index, boolean abort) {
        for (AssetRow row : rows) {
            if (row.invalid) {
                continue;
            }
            writeRow(row, result, index, abort);
        }
    }

    /** 写入一行：编号已存在则复用（不覆盖），否则新建资产卡片 */
    private void writeRow(AssetRow row, FixedAssetImportResult result, Index index, boolean abort) {
        if (!row.code.isEmpty() && index.assetsByCode.containsKey(row.code)) {
            result.reusedAssets++;
            log.info("固定资产导入：资产编号「{}」已存在，按复用处理（不覆盖原有数据）", row.code);
            return;
        }

        String locationName = null;
        if (!row.location.isEmpty()) {
            locationName = ensureLocation(row, result, index, abort);
            if (locationName == null) {
                return; // 地点创建失败，该行已记录失败
            }
        }

        String code = row.code.isEmpty() ? autoAssetCode(index) : row.code;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("name", row.name);
        body.put("category", row.category);
        body.put("brand", row.brand);
        body.put("model", row.model);
        if (row.companyId != null) {
            body.put("companyId", row.companyId);
        }
        if (row.deptId != null) {
            body.put("deptId", row.deptId);
        }
        if (row.userId != null) {
            body.put("userId", row.userId);
        }
        if (locationName != null) {
            body.put("location", locationName);
        }
        if (!row.purchaseDate.isEmpty()) {
            body.put("purchaseDate", row.purchaseDate);
        }
        body.put("amount", row.amount);
        body.put("original", row.original);
        body.put("net", row.net);
        body.put("purchaseMode", row.purchaseMode);
        body.put("status", row.status);
        body.put("depreciate", row.depreciate);
        body.put("leaseMonths", row.leaseMonths);
        try {
            Map<String, Object> saved = genericService.create(ASSETS, body);
            String savedCode = str(saved.get("code"));
            index.assetsByCode.put(savedCode.isEmpty() ? code : savedCode, saved);
            result.createdAssets++;
        } catch (ApiException e) {
            fail(row, "新建资产失败：" + e.getMessage(), result, abort);
        }
    }

    /** 存放地点按名称匹配，不存在则自动建档（地点是基础数据，避免导入被卡住） */
    private String ensureLocation(AssetRow row, FixedAssetImportResult result, Index index, boolean abort) {
        if (index.locationNames.contains(row.location)) {
            return row.location;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", autoLocationCode(index));
        body.put("name", row.location);
        try {
            Map<String, Object> saved = genericService.create(LOCATIONS, body);
            index.locationNames.add(row.location);
            index.locationCodes.add(str(saved.get("code")));
            result.createdLocations++;
            return row.location;
        } catch (ApiException e) {
            fail(row, "创建存放地点「" + row.location + "」失败：" + e.getMessage(), result, abort);
            return null;
        }
    }

    // ---------------------------------------------------------------- 行解析与校验

    private AssetRow toAssetRow(ImportFileParser.ParsedRow raw, Index index, Set<String> fileCodes) {
        AssetRow row = new AssetRow();
        row.line = raw.line;

        row.name = value(raw, COL_NAME);
        if (row.name.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "资产名称不能为空");
        }

        String categoryInput = value(raw, COL_CATEGORY);
        if (categoryInput.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "资产分类不能为空");
        }
        row.category = resolveEnum(CATEGORY_ENUM, categoryInput);
        if (row.category == null) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "资产分类「" + categoryInput + "」不合法，可选值：" + describeEnum(CATEGORY_ENUM));
        }

        String statusInput = value(raw, COL_STATUS);
        row.status = statusInput.isEmpty() ? IDLE : resolveEnum(STATUS_ENUM, statusInput);
        if (row.status == null) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "状态「" + statusInput + "」不合法，可选值：" + describeEnum(STATUS_ENUM));
        }

        String modeInput = value(raw, COL_PURCHASE_MODE);
        row.purchaseMode = modeInput.isEmpty() ? "PURCHASE" : resolveEnum(PURCHASE_MODE_ENUM, modeInput);
        if (row.purchaseMode == null) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "购置方式「" + modeInput + "」不合法，可选值：" + describeEnum(PURCHASE_MODE_ENUM));
        }

        row.depreciate = parseBoolean(value(raw, COL_DEPRECIATE));

        row.brand = value(raw, COL_BRAND);
        row.model = value(raw, COL_MODEL);
        row.location = value(raw, COL_LOCATION);
        row.purchaseDate = parseDate(value(raw, COL_PURCHASE_DATE));

        row.amount = decimal(value(raw, COL_AMOUNT), "购置金额", false);
        String originalInput = value(raw, COL_ORIGINAL);
        row.original = originalInput.isEmpty() ? row.amount : decimal(originalInput, "资产原值", false);
        String netInput = value(raw, COL_NET);
        row.net = netInput.isEmpty() ? row.original : decimal(netInput, "净值", false);

        row.code = value(raw, COL_CODE);
        if (!row.code.isEmpty() && !fileCodes.add(row.code)) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "资产编号「" + row.code + "」在文件中重复出现（一物一码，请检查是否重复粘贴）");
        }

        resolveOrg(row, raw, index);
        return row;
    }

    /** 公司 / 部门 / 使用人：全部按业务名称匹配，客户不需要填写任何内部主键 */
    private void resolveOrg(AssetRow row, ImportFileParser.ParsedRow raw, Index index) {
        String companyName = value(raw, COL_COMPANY);
        if (!companyName.isEmpty()) {
            Map<String, Object> company = index.companiesByName.get(companyName);
            if (company == null) {
                throw new ApiException(ErrorCode.VALIDATION,
                        "所属公司「" + companyName + "」不存在，请先在组织架构中维护该公司");
            }
            row.companyId = str(company.get("id"));
        }

        String deptName = value(raw, COL_DEPT);
        if (!deptName.isEmpty()) {
            if (row.companyId != null) {
                Map<String, Object> dept = index.deptsByKey.get(row.companyId + KEY_SEP + deptName);
                if (dept == null) {
                    throw new ApiException(ErrorCode.VALIDATION,
                            "公司「" + companyName + "」下不存在部门「" + deptName + "」，请检查使用部门");
                }
                row.deptId = str(dept.get("id"));
            } else {
                List<Map<String, Object>> sameName = index.deptsByName.get(deptName);
                if (sameName == null || sameName.isEmpty()) {
                    throw new ApiException(ErrorCode.VALIDATION,
                            "使用部门「" + deptName + "」不存在，请检查部门名称或补填所属公司");
                }
                if (sameName.size() > 1) {
                    throw new ApiException(ErrorCode.VALIDATION,
                            "存在多个同名部门「" + deptName + "」，请同时填写所属公司");
                }
                row.deptId = str(sameName.get(0).get("id"));
            }
        }

        String userInput = value(raw, COL_USER);
        if (userInput.isEmpty()) {
            return;
        }
        Map<String, Object> byUsername = index.usersByUsername.get(userInput);
        if (byUsername != null) {
            row.userId = str(byUsername.get("id"));
            return;
        }
        List<Map<String, Object>> sameName = index.usersByName.get(userInput);
        if (sameName == null || sameName.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "使用人「" + userInput + "」不存在，可填姓名或登录账号");
        }
        if (sameName.size() > 1) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "存在多个同名人员「" + userInput + "」，请改填登录账号");
        }
        row.userId = str(sameName.get(0).get("id"));
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

    /** 是/否（也兼容 true/false、1/0、Y/N），留空默认计提折旧 */
    private static boolean parseBoolean(String text) {
        if (text == null || text.trim().isEmpty()) {
            return true;
        }
        String normalized = text.trim().toLowerCase(Locale.ROOT);
        if ("是".equals(normalized) || "true".equals(normalized) || "1".equals(normalized) || "y".equals(normalized)) {
            return true;
        }
        if ("否".equals(normalized) || "false".equals(normalized) || "0".equals(normalized) || "n".equals(normalized)) {
            return false;
        }
        throw new ApiException(ErrorCode.VALIDATION, "是否计提折旧只能填 是 或 否：" + text);
    }

    private static String parseDate(String text) {
        if (text == null || text.trim().isEmpty()) {
            return "";
        }
        String normalized = text.trim().replace('/', '-');
        try {
            return LocalDate.parse(normalized).format(DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (Exception e) {
            throw new ApiException(ErrorCode.VALIDATION, "购置日期格式应为 yyyy-MM-dd：" + text);
        }
    }

    /** 枚举：编码或中文名称都能匹配（业务人员填「电子设备」即可） */
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
     * 预加载索引：资产（按编号）、公司（按名称）、部门（公司+名称 / 仅名称）、人员（账号 / 姓名）、
     * 存放地点、资产编号前缀。一次性查库，避免逐行 N+1。
     */
    private Index loadIndex() {
        Index index = new Index();
        for (Map<String, Object> row : genericService.list(ASSETS, new HashMap<String, String[]>())) {
            String code = str(row.get("code"));
            if (!code.isEmpty()) {
                index.assetsByCode.put(code, row);
            }
        }
        for (Map<String, Object> row : genericService.list("org-companies", new HashMap<String, String[]>())) {
            String name = str(row.get("name"));
            if (!name.isEmpty()) {
                index.companiesByName.put(name, row);
            }
        }
        for (Map<String, Object> row : genericService.list("org-departments", new HashMap<String, String[]>())) {
            String name = str(row.get("name"));
            if (name.isEmpty()) {
                continue;
            }
            String companyId = str(row.get("companyId"));
            if (!companyId.isEmpty()) {
                index.deptsByKey.put(companyId + KEY_SEP + name, row);
            }
            index.deptsByName.computeIfAbsent(name, k -> new ArrayList<>()).add(row);
        }
        for (Map<String, Object> row : genericService.list("org-users", new HashMap<String, String[]>())) {
            String username = str(row.get("username"));
            if (!username.isEmpty()) {
                index.usersByUsername.put(username, row);
            }
            String name = str(row.get("name"));
            if (!name.isEmpty()) {
                index.usersByName.computeIfAbsent(name, k -> new ArrayList<>()).add(row);
            }
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
        index.codePrefix = assetCodePrefix();
        return index;
    }

    /** 资产编号前缀取自系统参数 sys.asset.code.prefix（与界面新增资产一致） */
    private String assetCodePrefix() {
        try {
            for (Map<String, Object> row : genericService.list("system-params", new HashMap<String, String[]>())) {
                if (CODE_PREFIX_PARAM.equals(str(row.get("key"))) && !str(row.get("value")).isEmpty()) {
                    return str(row.get("value"));
                }
            }
        } catch (RuntimeException e) {
            log.debug("读取资产编号前缀失败，使用默认值 {}", DEFAULT_PREFIX, e);
        }
        return DEFAULT_PREFIX;
    }

    private static String autoAssetCode(Index index) {
        String prefix = index.codePrefix + LocalDate.now().getYear();
        int n = index.assetsByCode.size() + 1;
        String code;
        do {
            code = prefix + String.format("%04d", n++);
        } while (index.assetsByCode.containsKey(code));
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

    // ---------------------------------------------------------------- 工具

    private void fail(AssetRow row, String message, FixedAssetImportResult result, boolean abort) {
        row.invalid = true;
        log.warn("固定资产导入失败：第 {} 行 - {}", row.line, message);
        if (abort) {
            throw new RowFailure(row.line, message);
        }
        result.failures.add(new FixedAssetImportResult.Failure(row.line, message));
    }

    private static void resetCounters(FixedAssetImportResult result) {
        result.createdAssets = 0;
        result.reusedAssets = 0;
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
    private static final class AssetRow {
        int line;
        String name = "";
        String category = "";
        String code = "";
        String brand = "";
        String model = "";
        String companyId;
        String deptId;
        String userId;
        String location = "";
        String purchaseDate = "";
        BigDecimal amount = BigDecimal.ZERO;
        BigDecimal original = BigDecimal.ZERO;
        BigDecimal net = BigDecimal.ZERO;
        String purchaseMode = "PURCHASE";
        String status = IDLE;
        boolean depreciate = true;
        BigDecimal leaseMonths = new BigDecimal("36");
        boolean invalid;
    }

    /** 预加载索引（一次查库，全量内存匹配） */
    private static final class Index {
        final Map<String, Map<String, Object>> assetsByCode = new LinkedHashMap<>();
        final Map<String, Map<String, Object>> companiesByName = new LinkedHashMap<>();
        final Map<String, Map<String, Object>> deptsByKey = new LinkedHashMap<>();
        final Map<String, List<Map<String, Object>>> deptsByName = new HashMap<>();
        final Map<String, Map<String, Object>> usersByUsername = new HashMap<>();
        final Map<String, List<Map<String, Object>>> usersByName = new HashMap<>();
        final Set<String> locationNames = new LinkedHashSet<>();
        final Set<String> locationCodes = new LinkedHashSet<>();
        String codePrefix = DEFAULT_PREFIX;
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
    public static class FixedAssetImportResult {
        public int total;
        public int createdAssets;
        public int reusedAssets;
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
