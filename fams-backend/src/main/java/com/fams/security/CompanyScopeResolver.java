package com.fams.security;

import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericMapper;
import com.fams.engine.QuerySpec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 公司可见范围解析：本公司 + 全部下级公司 + 显式授权公司。
 *
 * <p>集团化之前 {@code COMPANY} 是 {@code company_id = 本人公司} 精确等值，
 * 公司树的 {@code parent_id} 完全不参与鉴权。这里按组织树做一次广度展开，
 * 结果在主体构建后按「公司 + 数据范围 + 授权集合 + 代际」缓存，避免每请求递归查库。</p>
 *
 * <p>本类只依赖 {@link GenericMapper} 与 {@link ResourceRegistry}，不注入
 * {@code GenericService}：后者会依赖 {@code RowScopeGuard} → 本类，形成循环依赖。
 * 读的是组织主数据原始行，不需要脱敏与业务钩子。</p>
 *
 * <p>公司/部门主数据发生写入后由 {@link #invalidate()} 提升代际使缓存失效；
 * 展开过程用 visited 集合防环（组织数据被误改成环时不会死循环）。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CompanyScopeResolver {

    private static final String COMPANIES = "org-companies";

    private static final String DEPARTMENTS = "org-departments";

    /** 组织规模上限保护，防止脏数据导致无限展开 */
    private static final int MAX_NODES = 10000;

    private final GenericMapper mapper;

    private final ResourceRegistry registry;

    private final Map<String, Set<String>> cache = new ConcurrentHashMap<>();

    private volatile long generation = 0L;

    /**
     * @return {@code null} 表示全集团可见（不做公司过滤）；否则为可见公司 id 集合
     */
    public Set<String> visibleCompanyIds(UserPrincipal principal) {
        if (principal == null || isAll(principal.getDataScope())) {
            return null;
        }
        String cacheKey = cacheKey("company", principal);
        Set<String> cached = cache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        Set<String> visible = new LinkedHashSet<>();
        if (!isBlank(principal.getCompanyId())) {
            visible.add(principal.getCompanyId());
        }
        visible.addAll(principal.getScopeCompanyIds());
        expand(visible, childrenOf(COMPANIES, "parentId"));
        Set<String> frozen = Collections.unmodifiableSet(visible);
        cache.put(cacheKey, frozen);
        return frozen;
    }

    /**
     * D2：给定用户自身公司与显式授权公司，返回其可见公司集合（本公司 + 全部下级 + 授权）。
     * 供审批角色池按单据公司过滤使用，不依赖当前登录人。
     */
    public Set<String> visibleCompanyIdsFor(String companyId, java.util.Collection<String> extraIds) {
        Set<String> visible = new LinkedHashSet<>();
        if (!isBlank(companyId)) {
            visible.add(companyId);
        }
        if (extraIds != null) {
            for (String id : extraIds) {
                if (!isBlank(id)) {
                    visible.add(id);
                }
            }
        }
        expand(visible, childrenOf(COMPANIES, "parentId"));
        return Collections.unmodifiableSet(visible);
    }

    /**
     * 部门可见范围：本部门及全部子部门（{@code DEPT} 的新口径）。
     *
     * @return {@code null} 表示不需要部门过滤
     */
    public Set<String> visibleDeptIds(UserPrincipal principal) {
        if (principal == null || isAll(principal.getDataScope()) || isBlank(principal.getDeptId())) {
            return null;
        }
        String cacheKey = cacheKey("dept", principal);
        Set<String> cached = cache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        Set<String> visible = new LinkedHashSet<>();
        visible.add(principal.getDeptId());
        expand(visible, childrenOf(DEPARTMENTS, "parentId"));
        Set<String> frozen = Collections.unmodifiableSet(visible);
        cache.put(cacheKey, frozen);
        return frozen;
    }

    /** 组织主数据写入后调用：提升代际，旧缓存键不再命中 */
    public void invalidate() {
        generation++;
        cache.clear();
        log.debug("[company-scope] 组织层级缓存已失效，generation={}", generation);
    }

    private String cacheKey(String dimension, UserPrincipal principal) {
        return dimension + "|" + principal.getCompanyId() + "|" + principal.getDeptId() + "|"
                + principal.getDataScope() + "|" + principal.getScopeCompanyIds() + "|" + generation;
    }

    /** 读取「父 → 子」邻接表；兼容 camelCase 与 snake_case 列名 */
    private Map<String, List<String>> childrenOf(String key, String parentField) {
        Map<String, List<String>> children = new LinkedHashMap<>();
        for (Map<String, Object> row : allRows(key)) {
            String id = text(first(row, "id"));
            String parent = text(first(row, parentField, "parent_id"));
            if (id.isEmpty() || parent.isEmpty() || id.equals(parent)) {
                continue;
            }
            children.computeIfAbsent(parent, k -> new ArrayList<>()).add(id);
        }
        return children;
    }

    private List<Map<String, Object>> allRows(String key) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), 2000L, 0L);
        List<Map<String, Object>> rows = mapper.selectList(params);
        return rows == null ? Collections.emptyList() : rows;
    }

    private static void expand(Set<String> visible, Map<String, List<String>> children) {
        Deque<String> queue = new ArrayDeque<>(visible);
        int guard = 0;
        while (!queue.isEmpty() && guard++ < MAX_NODES) {
            String current = queue.poll();
            for (String child : children.getOrDefault(current, Collections.emptyList())) {
                if (visible.add(child)) {
                    queue.add(child);
                }
            }
        }
        if (guard >= MAX_NODES) {
            log.warn("[company-scope] 组织层级展开达到上限 {}，请检查组织数据是否成环", MAX_NODES);
        }
    }

    private static Object first(Map<String, Object> row, String... names) {
        for (String name : names) {
            Object value = row.get(name);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static boolean isAll(String scope) {
        return scope == null || scope.isEmpty() || "ALL".equalsIgnoreCase(scope);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
