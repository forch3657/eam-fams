package com.fams.contract;

import lombok.Data;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 集合元数据：由前端 schema.js 导出生成，后端不做二次声明。
 *
 * <p>一个 ResourceMeta 描述一张表 + 8 个通用端点的全部行为契约：
 * 主键字段、审计开关、字段类型、唯一性、外键、删除保护、库存联动等。</p>
 */
@Data
public class ResourceMeta {

    /** 契约 key，同时是 URL 路径片段 */
    private String key;

    private String label;

    /** 物理表名（snake_case） */
    private String table;

    /** 主键字段名（各集合不统一：id / code / name / recordNo / key） */
    private String pkField = "id";

    /** 主键是否由服务端生成 */
    private boolean idGenerated = true;

    /** 是否维护审计字段与 version */
    private boolean audit = true;

    /** 是否运行时动态产生的集合（单据列表 / 字典项） */
    private boolean dynamic;

    /** 动态集合的固有过滤条件，如字典项的 dict_code */
    private Map<String, Object> fixedFilters = new LinkedHashMap<>();

    private List<Field> fields = new ArrayList<>();

    private List<String> uniqueFields = new ArrayList<>();

    private List<Ref> refs = new ArrayList<>();

    private List<Protect> protect = new ArrayList<>();

    private List<ProtectContains> protectContains = new ArrayList<>();

    private ProtectSelf protectSelf;

    private List<StockGuard> stockGuard = new ArrayList<>();

    private Stock stock;

    private List<Cascade> cascade = new ArrayList<>();

    private List<String> keywordFields = new ArrayList<>();

    private List<String> filterFields = new ArrayList<>();

    private List<String> sortFields = new ArrayList<>();

    private boolean paged = true;

    public Optional<Field> field(String name) {
        return fields.stream().filter(f -> f.getName().equals(name)).findFirst();
    }

    public boolean isKnownField(String name) {
        return field(name).isPresent();
    }

    /** 可安全参与 LIKE 模糊匹配的文本型字段 */
    public boolean isTextField(String name) {
        return field(name)
                .map(f -> "string".equals(f.getType()) || "enum".equals(f.getType()) || "text".equals(f.getType()))
                .orElse(false);
    }

    /** 数组字段：读写时为 JSON 文本列 */
    public Set<String> arrayFields() {
        return fields.stream().filter(Field::isArray).map(Field::getName).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public Set<String> dateFields() {
        return fields.stream().filter(Field::isDate).map(Field::getName).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public Set<String> numberFields() {
        return fields.stream().filter(Field::isNumber).map(Field::getName).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * 所有物理列（含审计列）。
     *
     * <p>契约里部分集合把 {@code createTime} 等业务字段也写进了字段表（单据创建时间），
     * 与审计字段同名。契约约定"审计字段由服务端维护，前端传了也以服务端为准"，
     * 因此这里按同名合并，只保留一列。</p>
     */
    public List<String> getAllColumns() {
        List<String> cols = new ArrayList<>();
        cols.add(pkField);
        for (Field f : fields) {
            String name = f.getName();
            if (name.equals(pkField) || cols.contains(name)) {
                continue;
            }
            if (audit && AUDIT_COLUMNS.contains(name)) {
                continue; // 审计列在下面统一追加，避免重复
            }
            cols.add(name);
        }
        if (audit) {
            cols.addAll(AUDIT_COLUMNS);
        }
        return cols;
    }

    public static final List<String> AUDIT_COLUMNS = Collections.unmodifiableList(
            new ArrayList<>(java.util.Arrays.asList("createBy", "createTime", "updateBy", "updateTime", "version")));

    // ------------------------------------------------------------------ 内嵌元数据

    @Data
    public static class Field {
        private String name;
        private String type;
        private boolean required;
        private boolean unique;
        private String enumName;
        private String refCollection;

        public boolean isArray() { return "array".equals(type); }
        public boolean isDate() { return "date".equals(type); }
        public boolean isNumber() { return "number".equals(type); }
        public boolean isBoolean() { return "boolean".equals(type); }
        public boolean isObject() { return "object".equals(type); }
        public boolean isEnum() { return "enum".equals(type); }
        public boolean isRef() { return refCollection != null && !refCollection.isEmpty(); }
    }

    /** 外键：本行 field 的值必须是 collection 中某行的主键 */
    @Data
    public static class Ref {
        private String field;
        private String collection;
    }

    /** 跨集合引用保护：目标集合存在 field = 本行主键（或 valueFrom 字段值）的记录时禁止删除 */
    @Data
    public static class Protect {
        private String collection;
        private String field;
        private String message;
        private String valueFrom;
    }

    /** 数组包含保护：目标集合某行的 field 数组包含本行主键时禁止删除 */
    @Data
    public static class ProtectContains {
        private String collection;
        private String field;
        private String message;
    }

    /** 自引用保护：本集合内存在 field = 本行 idField 值的记录时禁止删除 */
    @Data
    public static class ProtectSelf {
        private String field;
        private String idField;
        private String message;
    }

    /** 数量守卫：本行 field > 0 时禁止删除 */
    @Data
    public static class StockGuard {
        private String field;
        private String message;
    }

    /**
     * 库存联动规则：状态驱动的三段结算。
     * <ul>
     *   <li>settleOn：进入该状态才真正结算 stock</li>
     *   <li>reserveOn：进入该状态时预占 reserved（领用单）</li>
     *   <li>releaseOn：进入这些状态时释放预占</li>
     * </ul>
     */
    @Data
    public static class Stock {
        private String effect = "in";
        private String target;
        /** 单据上指向物品主键的字段名 */
        private String itemField = "itemId";
        private String qtyField = "quantity";
        private String stockField = "stock";
        private String settleOn = "DONE";
        private String reservedField;
        private String reserveOn;
        private List<String> releaseOn = new ArrayList<>();

        public boolean isOut() { return "out".equals(effect); }
    }

    /** 级联删除：删除本行时同时清理匹配 pattern 的动态集合 */
    @Data
    public static class Cascade {
        private String pattern;
        private String message;
    }
}
