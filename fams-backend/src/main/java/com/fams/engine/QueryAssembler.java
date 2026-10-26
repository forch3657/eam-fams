package com.fams.engine;

import com.fams.contract.ResourceMeta;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 查询装配：把 query string 转成安全的数据访问参数（契约 1.2）。
 *
 * <p>支持的语义：
 * <ul>
 *   <li>{@code keyword}：在契约声明的 keyword 字段上做包含匹配；</li>
 *   <li>{@code <字段名>}：精确过滤，同名参数多次出现表示 IN 查询；</li>
 *   <li>{@code sortBy} / {@code sortOrder}：排序字段与方向（默认 desc）；</li>
 *   <li>{@code page} / {@code pageSize}：分页（page 从 1 开始）。</li>
 * </ul>
 * 未登记的参数一律忽略，既避免注入，也避免无索引的全字段扫描。
 */
@Component
public class QueryAssembler {

    static final long DEFAULT_PAGE = 1L;

    static final long DEFAULT_PAGE_SIZE = 20L;

    static final long MAX_PAGE_SIZE = 200L;

    /** 不分页场景的兜底上限，防止整表拖拽 */
    static final long UNPAGED_CAP = 2000L;

    private static final List<String> RESERVED = Arrays.asList("sortBy", "sortOrder", "page", "pageSize", "_t");

    /** 列表查询（不分页，但有上限保护） */
    public Map<String, Object> buildList(ResourceMeta meta, Map<String, String[]> raw) {
        QuerySpec spec = where(meta, raw).orderBy(resolveSortBy(meta, raw), resolveSortOrder(raw));
        return spec.toParams(meta.getAllColumns(), UNPAGED_CAP, 0L);
    }

    /** 分页查询 */
    public Map<String, Object> buildPage(ResourceMeta meta, Map<String, String[]> raw) {
        QuerySpec spec = where(meta, raw).orderBy(resolveSortBy(meta, raw), resolveSortOrder(raw));
        long page = parseLong(first(raw, "page"), DEFAULT_PAGE);
        long pageSize = parseLong(first(raw, "pageSize"), DEFAULT_PAGE_SIZE);
        if (page < 1) {
            page = DEFAULT_PAGE;
        }
        if (pageSize < 1) {
            pageSize = DEFAULT_PAGE_SIZE;
        }
        pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
        Map<String, Object> params = spec.toParams(meta.getAllColumns(), pageSize, (page - 1) * pageSize);
        // PageResult 需要回显 page / pageSize（limit / offset 是给 SQL 用的）
        params.put("page", page);
        params.put("pageSize", pageSize);
        return params;
    }

    /** 按主键定位（供引擎内部使用） */
    public Map<String, Object> buildById(ResourceMeta meta, String id) {
        return new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
    }

    private QuerySpec where(ResourceMeta meta, Map<String, String[]> raw) {
        QuerySpec spec = new QuerySpec(meta);
        if (raw == null) {
            return spec;
        }
        for (Map.Entry<String, String[]> entry : raw.entrySet()) {
            String key = entry.getKey();
            String[] vals = entry.getValue();
            if (RESERVED.contains(key) || vals == null || vals.length == 0) {
                continue;
            }
            if ("keyword".equals(key)) {
                spec.anyContains(meta.getKeywordFields(), vals[0]);
                continue;
            }
            if (vals.length == 1) {
                spec.eq(key, vals[0]);
            } else {
                spec.in(key, Arrays.asList(vals));
            }
        }
        return spec;
    }

    private String resolveSortBy(ResourceMeta meta, Map<String, String[]> raw) {
        String sortBy = first(raw, "sortBy");
        if (sortBy != null && !sortBy.isEmpty() && meta.isKnownField(sortBy)) {
            return sortBy;
        }
        if (!meta.getSortFields().isEmpty()) {
            return meta.getSortFields().get(0);
        }
        return meta.isAudit() && meta.isKnownField("updateTime") ? "updateTime" : meta.getPkField();
    }

    private boolean resolveSortOrder(Map<String, String[]> raw) {
        String order = first(raw, "sortOrder");
        return order == null || order.isEmpty() || !"asc".equalsIgnoreCase(order);
    }

    private static String first(Map<String, String[]> raw, String key) {
        if (raw == null) {
            return null;
        }
        String[] vals = raw.get(key);
        return vals == null || vals.length == 0 ? null : vals[0];
    }

    private static long parseLong(String text, long fallback) {
        if (text == null || text.trim().isEmpty()) {
            return fallback;
        }
        try {
            return Long.parseLong(text.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
