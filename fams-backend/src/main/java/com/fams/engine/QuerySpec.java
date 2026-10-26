package com.fams.engine;

import com.fams.contract.Ident;
import com.fams.contract.ResourceMeta;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 查询条件构造器：只接受元数据里声明过的字段，统一产出安全的 MyBatis 参数。
 *
 * <p>所有值都放在嵌套 map {@code v} 里，占位符形如 {@code #{v.k0}}；
 * 表名与列名取自元数据并经 {@link Ident#check} 校验，请求参数无法影响 SQL 结构。</p>
 */
public class QuerySpec {

    private final ResourceMeta meta;

    private final List<String> where = new ArrayList<>();

    private final Map<String, Object> values = new LinkedHashMap<>();

    private int seq;

    private String sortSql;

    public QuerySpec(ResourceMeta meta) {
        this.meta = meta;
    }

    /** 字段相等；字段未登记或值为空则忽略 */
    public QuerySpec eq(String field, Object value) {
        if (!meta.isKnownField(field) || isBlank(value)) {
            return this;
        }
        String ph = next();
        where.add("`" + Names.camelToSnake(field) + "` = #{v." + ph + "}");
        values.put(ph, RowCodec.encodeValue(meta, field, value));
        return this;
    }

    /** 字段不等；用于唯一性校验时排除自身 */
    public QuerySpec ne(String field, Object value) {
        if (!meta.isKnownField(field) || isBlank(value)) {
            return this;
        }
        String ph = next();
        where.add("`" + Names.camelToSnake(field) + "` <> #{v." + ph + "}");
        values.put(ph, RowCodec.encodeValue(meta, field, value));
        return this;
    }

    /** 目标行主键相等（用于外键存在性校验） */
    public QuerySpec eqPrimary(Object value) {
        return eq(meta.getPkField(), value);
    }

    /** 多值 IN 查询（同名参数多次出现） */
    public QuerySpec in(String field, Iterable<?> values) {
        if (!meta.isKnownField(field)) {
            return this;
        }
        StringBuilder sb = new StringBuilder("`").append(Names.camelToSnake(field)).append("` IN (");
        int i = 0;
        for (Object value : values) {
            if (i > 0) {
                sb.append(", ");
            }
            String ph = next();
            sb.append("#{v.").append(ph).append('}');
            this.values.put(ph, RowCodec.encodeValue(meta, field, value));
            i++;
        }
        if (i == 0) {
            return this;
        }
        where.add(sb.append(')').toString());
        return this;
    }

    /** 关键字：多字段 OR 包含匹配 */
    public QuerySpec anyContains(java.util.List<String> fields, String keyword) {
        if (keyword == null || keyword.trim().isEmpty()) {
            return this;
        }
        List<String> parts = new ArrayList<>();
        for (String field : fields) {
            // 只做文本匹配：数值/日期列上的 LIKE 在不同库上行为不一致（且无法走索引）
            if (!meta.isTextField(field)) {
                continue;
            }
            String ph = next();
            parts.add("LOWER(`" + Names.camelToSnake(field) + "`) LIKE LOWER(#{v." + ph + "})");
            values.put(ph, "%" + keyword.trim() + "%");
        }
        if (parts.isEmpty()) {
            return this;
        }
        where.add("(" + String.join(" OR ", parts) + ")");
        return this;
    }

    /** 排序：字段与方向都在此收敛为白名单片段 */
    public QuerySpec orderBy(String field, boolean desc) {
        this.sortSql = "`" + Names.camelToSnake(field) + "` " + (desc ? "DESC" : "ASC");
        return this;
    }

    public Map<String, Object> toParams(List<String> columns, Long limit, Long offset) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("table", Ident.check(meta.getTable()));
        p.put("pk", Ident.check(meta.getPkField()));
        p.put("columns", columns);
        p.put("where", String.join(" AND ", where));
        // 动态集合的固有过滤值单独绑定（占位符 #{fx0}）：
        // 不绑定的话 SQL 会拿 null 去比较，导致一个字典项都查不出来
        int i = 0;
        for (Map.Entry<String, Object> entry : meta.getFixedFilters().entrySet()) {
            p.put("fx" + i, entry.getValue());
            i++;
        }
        p.put("fixedFilters", meta.getFixedFilters());
        p.put("v", values);
        if (limit != null) {
            p.put("limit", limit);
        }
        if (offset != null) {
            p.put("offset", offset);
        }
        return p;
    }

    private static boolean isBlank(Object value) {
        return value == null || String.valueOf(value).trim().isEmpty();
    }

    private String next() {
        return "k" + (seq++);
    }
}
