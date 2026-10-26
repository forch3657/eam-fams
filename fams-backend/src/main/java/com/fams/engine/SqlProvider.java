package com.fams.engine;

import com.fams.contract.Ident;

import java.util.List;
import java.util.Map;

/**
 * 动态 SQL 拼装。
 *
 * <p>参数约定（均由调用方 {@link GenericService} 组装）：
 * <ul>
 *   <li>{@code table}：物理表名（取自元数据）</li>
 *   <li>{@code pk}：主键字段名</li>
 *   <li>{@code columns}：查询列名（契约字段名）</li>
 *   <li>{@code where}：已拼好的条件片段，占位符形如 {@code #{v.k0}}</li>
 *   <li>{@code orderBy}：排序片段（字段经白名单校验）</li>
 *   <li>{@code limit} / {@code offset}：分页</li>
 *   <li>{@code cols}：插入/更新列（契约字段名）</li>
 *   <li>{@code id}：主键值</li>
 * </ul>
 */
public class SqlProvider {

    public String selectList(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("SELECT ")
                .append(projection(params))
                .append(" FROM ")
                .append(Ident.q(table(params)));
        appendWhere(sb, params);
        appendOrder(sb, params);
        appendLimit(sb, params);
        return sb.toString();
    }

    public String count(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("SELECT COUNT(*) FROM ").append(Ident.q(table(params)));
        appendWhere(sb, params);
        return sb.toString();
    }

    public String selectById(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("SELECT ")
                .append(projection(params))
                .append(" FROM ")
                .append(Ident.q(table(params)))
                .append(" WHERE ")
                .append(Ident.q(pk(params)))
                .append(" = #{id}");
        appendFixedFilters(sb, params, "f");
        return sb.toString();
    }

    public String sum(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("SELECT COALESCE(SUM(")
                .append(Ident.q(Names.camelToSnake(String.valueOf(params.get("sumColumn")))))
                .append("), 0) FROM ")
                .append(Ident.q(table(params)));
        appendWhere(sb, params);
        return sb.toString();
    }

    public String selectForUpdate(Map<String, Object> params) {
        return new StringBuilder("SELECT * FROM ")
                .append(Ident.q(table(params)))
                .append(" WHERE ")
                .append(Ident.q(pk(params)))
                .append(" = #{id}")
                .append(" FOR UPDATE")
                .toString();
    }

    /** 按任意 where 条件更新单列 */
    public String updateWhere(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("UPDATE ")
                .append(Ident.q(table(params)))
                .append(" SET ")
                .append(Ident.q(Names.camelToSnake(String.valueOf(params.get("column")))))
                .append(" = #{v.f0}");
        appendWhere(sb, params);
        return sb.toString();
    }

    public String updateColumn(Map<String, Object> params) {
        return new StringBuilder("UPDATE ")
                .append(Ident.q(table(params)))
                .append(" SET ")
                .append(Ident.q(Names.camelToSnake(String.valueOf(params.get("column")))))
                .append(" = #{v.f0}")
                .append(" WHERE ")
                .append(Ident.q(pk(params)))
                .append(" = #{id}")
                .toString();
    }

    public String insert(Map<String, Object> params) {
        List<String> cols = cols(params);
        StringBuilder sb = new StringBuilder("INSERT INTO ")
                .append(Ident.q(table(params)))
                .append(" (")
                .append(Ident.join(Names.camelToSnakeList(cols)))
                .append(") VALUES (");
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append("#{v.f").append(i).append('}');
        }
        return sb.append(')').toString();
    }

    public String updateById(Map<String, Object> params) {
        List<String> cols = cols(params);
        StringBuilder sb = new StringBuilder("UPDATE ").append(Ident.q(table(params))).append(" SET ");
        for (int i = 0; i < cols.size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(Ident.q(Names.camelToSnake(cols.get(i))))
                    .append(" = #{v.f").append(i).append('}');
        }
        sb.append(" WHERE ").append(Ident.q(pk(params))).append(" = #{id}");
        appendFixedFilters(sb, params, "f");
        return sb.toString();
    }

    public String deleteById(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("DELETE FROM ").append(Ident.q(table(params)))
                .append(" WHERE ").append(Ident.q(pk(params))).append(" = #{id}");
        appendFixedFilters(sb, params, "f");
        return sb.toString();
    }

    public String deleteAll(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder("DELETE FROM ").append(Ident.q(table(params)));
        appendFixedFilters(sb, params, "f");
        return sb.toString();
    }

    // ------------------------------------------------------------------ 内部

    private void appendWhere(StringBuilder sb, Map<String, Object> params) {
        Object where = params.get("where");
        if (where != null && !where.toString().isEmpty()) {
            sb.append(" WHERE ").append(where);
        }
        appendFixedFilters(sb, params, "f");
    }

    /** 动态集合的固有过滤（如字典项 dict_code），必须始终生效 */
    private void appendFixedFilters(StringBuilder sb, Map<String, Object> params, String prefix) {
        Object fixed = params.get("fixedFilters");
        if (!(fixed instanceof Map) || ((Map<?, ?>) fixed).isEmpty()) {
            return;
        }
        Map<?, ?> filters = (Map<?, ?>) fixed;
        int i = 0;
        for (Map.Entry<?, ?> entry : filters.entrySet()) {
            String column = Names.camelToSnake(String.valueOf(entry.getKey()));
            sb.append(sb.toString().contains(" WHERE ") ? " AND " : " WHERE ")
                    .append(Ident.q(column))
                    .append(" = #{").append(prefix).append('x').append(i).append('}');
            i++;
        }
    }

    private void appendOrder(StringBuilder sb, Map<String, Object> params) {
        Object orderBy = params.get("orderBy");
        if (orderBy != null && !orderBy.toString().isEmpty()) {
            sb.append(" ORDER BY ").append(orderBy);
        }
    }

    private void appendLimit(StringBuilder sb, Map<String, Object> params) {
        Object limit = params.get("limit");
        if (limit == null) {
            return;
        }
        sb.append(" LIMIT #{limit}");
        Object offset = params.get("offset");
        if (offset != null) {
            sb.append(" OFFSET #{offset}");
        }
    }

    private String projection(Map<String, Object> params) {
        Object columns = params.get("columns");
        if (columns instanceof List) {
            @SuppressWarnings("unchecked")
            List<String> list = (List<String>) columns;
            return Ident.join(Names.camelToSnakeList(list));
        }
        return "*";
    }

    @SuppressWarnings("unchecked")
    private List<String> cols(Map<String, Object> params) {
        return (List<String>) params.get("cols");
    }

    private String table(Map<String, Object> params) {
        return String.valueOf(params.get("table"));
    }

    private String pk(Map<String, Object> params) {
        return String.valueOf(params.get("pk"));
    }
}
