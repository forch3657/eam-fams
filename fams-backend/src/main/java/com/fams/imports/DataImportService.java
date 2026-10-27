package com.fams.imports;

import com.fams.common.ApiException;
import com.fams.contract.EnumCatalog;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;
import com.fams.rule.RuleEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 通用数据导入：复用契约引擎的 {@link RowCodec}（类型/枚举/引用转换）与 {@link RuleEngine}（必填/唯一/引用校验），
 * 以及 {@link GenericService#create}（审计戳、密码加密、钩子、库存联动全部生效）。
 *
 * <p>因此导入行为与界面单次新增完全一致，不会绕开任何业务规则。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataImportService {

    /** 模板中说明行 / 示例行的前缀：以 # 开头的行在导入时会被忽略 */
    private static final String NOTE_PREFIX = "#";

    private final ResourceRegistry registry;
    private final GenericService genericService;
    private final RowCodec codec;
    private final RuleEngine rules;
    private final EnumCatalog enumCatalog;
    private final ImportFileParser fileParser;

    /** 列出可导入的资源及其字段（供前端构建模板与映射 UI） */
    public List<ResourceInfo> listResources() {
        return registry.all().stream()
                .map(m -> new ResourceInfo(
                        m.getKey(),
                        m.getLabel(),
                        m.getPkField(),
                        m.isIdGenerated(),
                        m.getFields().stream()
                                .map(f -> new FieldInfo(f.getName(), f.getType(), f.isRequired(),
                                        f.isUnique(), f.getEnumName(), f.getRefCollection(),
                                        enumValuesOf(f.getEnumName())))
                                .collect(Collectors.toList())))
                .collect(Collectors.toList());
    }

    /**
     * 生成 CSV 模板，共三行：
     * <ol>
     *   <li>表头：字段名（导入解析依赖此行，不要改）</li>
     *   <li>说明：以 # 开头，标注必填/唯一/可选枚举值/引用目标，导入时自动忽略</li>
     *   <li>示例：以 # 开头，给出可直接照抄的取值样式，导入时自动忽略</li>
     * </ol>
     * 用户只需在示例行下方继续追加数据行即可，无需删掉说明/示例行。
     */
    public String templateCsv(String key) {
        ResourceMeta meta = registry.resolve(key);
        List<ResourceMeta.Field> fields = meta.getFields();

        StringBuilder header = new StringBuilder();
        StringBuilder note = new StringBuilder();
        StringBuilder sample = new StringBuilder();

        for (int i = 0; i < fields.size(); i++) {
            ResourceMeta.Field f = fields.get(i);
            if (i > 0) {
                header.append(',');
                note.append(',');
                sample.append(',');
            }
            header.append(csvCell(f.getName()));
            if (i == 0) {
                note.append(NOTE_PREFIX).append("说明 ");
            }
            note.append(csvCell(describe(f, meta)));
            if (i == 0) {
                sample.append(NOTE_PREFIX).append("示例 ");
            }
            sample.append(csvCell(sampleOf(f, meta)));
        }
        return header + "\n" + note + "\n" + sample + "\n";
    }

    /**
     * 导入文件（CSV / XLSX）。
     *
     * @param abortOnError true：先整体校验，任一单元格非法则整批拒绝、不落库；
     *                     false：逐行尝试，失败的记录单独记录，成功的正常写入。
     */
    public ImportResult doImport(String key, MultipartFile file, boolean abortOnError) throws IOException {
        ResourceMeta meta = registry.resolve(key);
        List<ImportFileParser.ParsedRow> rows = parse(meta, file);
        int total = rows.size();
        List<ImportResult.Failure> failures = new ArrayList<>();
        int success = 0;

        if (abortOnError) {
            for (ImportFileParser.ParsedRow row : rows) {
                try {
                    validateRow(meta, row.values);
                } catch (Exception e) {
                    failures.add(new ImportResult.Failure(row.line, messageOf(e)));
                }
            }
            if (!failures.isEmpty()) {
                return new ImportResult(total, 0, "REJECTED_INVALID", failures);
            }
        }

        for (ImportFileParser.ParsedRow row : rows) {
            try {
                if (!abortOnError) {
                    validateRow(meta, row.values);
                }
                genericService.create(key, new LinkedHashMap<>(row.values));
                success++;
            } catch (Exception e) {
                failures.add(new ImportResult.Failure(row.line, messageOf(e)));
            }
        }

        String status = failures.isEmpty() ? "OK" : (success == 0 ? "FAILED" : "PARTIAL");
        return new ImportResult(total, success, status, failures);
    }

    private void validateRow(ResourceMeta meta, Map<String, String> row) {
        Map<String, Object> api = new LinkedHashMap<>(row);
        Map<String, Object> db = codec.toDbRow(meta, api, false);
        rules.validate(meta, db, null);
    }

    private static String messageOf(Exception e) {
        if (e instanceof ApiException) {
            return ((ApiException) e).getMessage();
        }
        return e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
    }

    // ------------------------------------------------------------------ 模板

    private List<String> enumValuesOf(String enumName) {
        if (enumName == null || enumName.isEmpty()) {
            return Collections.emptyList();
        }
        Set<String> allowed = enumCatalog.allowed(enumName);
        return allowed.isEmpty() ? Collections.emptyList() : new ArrayList<>(allowed);
    }

    /** 字段填写说明：必填/唯一、枚举可选值、引用目标主键（附真实示例）、业务语义 */
    private String describe(ResourceMeta.Field f, ResourceMeta meta) {
        boolean isPk = f.getName().equals(meta.getPkField());
        if (isPk && meta.isIdGenerated()) {
            return "主键，可留空（系统自动生成）";
        }
        List<String> parts = new ArrayList<>();
        if (f.isRequired()) {
            parts.add("必填");
        }
        if (f.isUnique()) {
            parts.add("唯一");
        }
        List<String> enumValues = enumValuesOf(f.getEnumName());
        if (!enumValues.isEmpty()) {
            parts.add("可选值 " + String.join("/", enumValues));
        } else if (f.getRefCollection() != null && !f.getRefCollection().isEmpty()) {
            String real = firstPk(f.getRefCollection());
            parts.add(real != null
                    ? "填「" + f.getRefCollection() + "」的主键，如 " + real
                    : "填「" + f.getRefCollection() + "」的主键");
        } else {
            String hint = semanticHint(f.getName());
            parts.add(hint != null ? hint : typeHint(f.getType()));
        }
        return parts.isEmpty() ? typeHint(f.getType()) : String.join("；", parts);
    }

    /** 示例取值：引用列取库里真实主键、枚举取首个可取值，其余按字段语义给贴近业务的示例 */
    private String sampleOf(ResourceMeta.Field f, ResourceMeta meta) {
        boolean isPk = f.getName().equals(meta.getPkField());
        if (isPk && meta.isIdGenerated()) {
            return "";
        }
        List<String> enumValues = enumValuesOf(f.getEnumName());
        if (!enumValues.isEmpty()) {
            return enumValues.get(0);
        }
        if (f.getRefCollection() != null && !f.getRefCollection().isEmpty()) {
            String real = firstPk(f.getRefCollection());
            return real != null ? real : "请填主键";
        }
        String semantic = semanticSample(meta.getKey(), f.getName());
        if (semantic != null) {
            return semantic;
        }
        String type = String.valueOf(f.getType());
        if ("number".equals(type)) {
            return "1";
        }
        if ("date".equals(type)) {
            return "2026-01-01";
        }
        if ("boolean".equals(type)) {
            return "true";
        }
        if ("array".equals(type) || "object".equals(type)) {
            return "[]";
        }
        return "示例";
    }

    /** 取引用集合中一条真实记录的主键，让示例与库里数据对得上（集合为空则返回 null） */
    private String firstPk(String collectionKey) {
        try {
            ResourceMeta target = registry.resolve(collectionKey);
            List<Map<String, Object>> rows = genericService.list(collectionKey, new HashMap<String, String[]>());
            if (rows != null && !rows.isEmpty()) {
                Object value = rows.get(0).get(target.getPkField());
                if (value != null && !String.valueOf(value).isEmpty()) {
                    return String.valueOf(value);
                }
            }
        } catch (Exception e) {
            log.debug("查询引用集合示例主键失败: {}", collectionKey, e);
        }
        return null;
    }

    /** 说明行里的业务语义提示 */
    private static String semanticHint(String fieldName) {
        String f = fieldName.toLowerCase();
        if ("username".equals(f)) {
            return "登录账号";
        }
        if ("password".equals(f)) {
            return "初始口令（明文，导入后自动 BCrypt 加密）";
        }
        if ("email".equals(f)) {
            return "邮箱";
        }
        if ("phone".equals(f) || "mobile".equals(f) || "tel".equals(f)) {
            return "手机号";
        }
        if ("roleids".equals(f)) {
            return "角色主键数组，如 [\"R1\"]";
        }
        return null;
    }

    /** 示例行里的业务取值：按字段名 + 资源类型给出贴近真实的数据 */
    private static String semanticSample(String resourceKey, String fieldName) {
        String f = fieldName.toLowerCase();
        if ("name".equals(f)) {
            return sampleName(resourceKey);
        }
        if ("code".equals(f)) {
            return sampleCode(resourceKey);
        }
        if ("username".equals(f)) {
            return "zhangsan";
        }
        if ("password".equals(f)) {
            return "Zhang@2026!";
        }
        if ("email".equals(f)) {
            return "zhangsan@example.com";
        }
        if ("phone".equals(f) || "mobile".equals(f) || "tel".equals(f)) {
            return "13800138000";
        }
        if ("address".equals(f)) {
            return "福州市鼓楼区五四路100号";
        }
        if ("leader".equals(f)) {
            return "李四";
        }
        if ("position".equals(f)) {
            return "工程师";
        }
        if ("remark".equals(f) || "note".equals(f) || "description".equals(f)) {
            return "示例说明";
        }
        if ("sort".equals(f) || "seq".equals(f)) {
            return "1";
        }
        if ("headcount".equals(f)) {
            return "10";
        }
        if ("quantity".equals(f) || "stock".equals(f) || "count".equals(f)) {
            return "10";
        }
        if ("price".equals(f) || "amount".equals(f) || "cost".equals(f) || "total".equals(f)
                || f.contains("value")) {
            return "1000.00";
        }
        if ("rate".equals(f) || "ratio".equals(f)) {
            return "5";
        }
        if ("roleids".equals(f)) {
            return "[\"R1\"]";
        }
        if (f.endsWith("at") || f.contains("time") || f.contains("datetime")) {
            return "2026-01-01 09:00:00";
        }
        if (f.endsWith("date") || f.contains("date")) {
            return "2026-01-01";
        }
        if ("id".equals(f)) {
            return "ID-001";
        }
        return null;
    }

    private static String sampleName(String resourceKey) {
        String k = resourceKey == null ? "" : resourceKey;
        if (k.startsWith("org-users")) {
            return "张三";
        }
        if (k.startsWith("org-companies")) {
            return "示例科技有限公司";
        }
        if (k.startsWith("org-departments")) {
            return "研发部";
        }
        if (k.contains("low-value")) {
            return "A4 打印纸";
        }
        if (k.startsWith("system-dict")) {
            return "资产状态";
        }
        if (k.startsWith("fixed-asset")) {
            return "笔记本电脑";
        }
        return "示例名称";
    }

    private static String sampleCode(String resourceKey) {
        String k = resourceKey == null ? "" : resourceKey;
        if (k.startsWith("org-companies")) {
            return "GS-0001";
        }
        if (k.startsWith("org-departments")) {
            return "BM-0001";
        }
        if (k.startsWith("fixed-asset")) {
            return "ZC-2026-0001";
        }
        if (k.startsWith("system-dict")) {
            return "asset_status";
        }
        return "CODE-001";
    }

    private static String typeHint(String type) {
        String t = String.valueOf(type);
        switch (t) {
            case "number":
                return "数字";
            case "date":
                return "日期，格式 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss";
            case "boolean":
                return "true / false";
            case "array":
            case "object":
                return "JSON 文本";
            default:
                return "文本";
        }
    }

    /** CSV 单元格转义：含逗号/引号/换行时用双引号包裹 */
    private static String csvCell(String v) {
        if (v == null || v.isEmpty()) {
            return "";
        }
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    // ------------------------------------------------------------------ 解析

    /**
     * 解析文件并做「资源相关」的取值友好化。
     *
     * <p>通用的 CSV / XLSX 解析、说明行跳过与行号保留由 {@link ImportFileParser} 负责，
     * 本方法只补充依赖资源元数据的归一化处理，保证按资源导入行为与抽取前完全一致。</p>
     */
    private List<ImportFileParser.ParsedRow> parse(ResourceMeta meta, MultipartFile file) throws IOException {
        List<ImportFileParser.ParsedRow> rows = fileParser.parse(file);
        for (ImportFileParser.ParsedRow row : rows) {
            for (Map.Entry<String, String> entry : row.values.entrySet()) {
                String h = entry.getKey();
                String v = entry.getValue();
                // 友好化：日期列允许 "yyyy-MM-dd HH:mm:ss"（空格），归一化为 ISO 的 'T'
                if (meta.field(h).map(ResourceMeta.Field::isDate).orElse(false)
                        && v != null && v.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}")) {
                    entry.setValue(v.replace(' ', 'T'));
                }
            }
        }
        return rows;
    }

    // ------------------------------------------------------------------ DTO

    public static class ResourceInfo {
        public String key;
        public String label;
        public String pkField;
        public boolean idGenerated;
        public List<FieldInfo> fields;

        public ResourceInfo(String key, String label, String pkField, boolean idGenerated, List<FieldInfo> fields) {
            this.key = key;
            this.label = label;
            this.pkField = pkField;
            this.idGenerated = idGenerated;
            this.fields = fields;
        }
    }

    public static class FieldInfo {
        public String name;
        public String type;
        public boolean required;
        public boolean unique;
        public String enumName;
        public String refCollection;
        /** 枚举可选值（前端展示与说明使用） */
        public List<String> enumValues;

        public FieldInfo(String name, String type, boolean required, boolean unique,
                        String enumName, String refCollection, List<String> enumValues) {
            this.name = name;
            this.type = type;
            this.required = required;
            this.unique = unique;
            this.enumName = enumName;
            this.refCollection = refCollection;
            this.enumValues = enumValues;
        }
    }

    public static class ImportResult {
        public int total;
        public int success;
        public String status;
        public List<Failure> failures;

        public ImportResult(int total, int success, String status, List<Failure> failures) {
            this.total = total;
            this.success = success;
            this.status = status;
            this.failures = failures;
        }

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
