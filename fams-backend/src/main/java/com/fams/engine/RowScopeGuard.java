package com.fams.engine;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.security.AuthContext;
import com.fams.security.CompanyScopeResolver;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 统一行级范围断言（D1）：所有读、写、批量、清空、单列更新共用一套规则。
 *
 * <p>改造前只有 {@code GenericService.list/page} 两处调用 {@code scopedRaw}，
 * 按 id 的详情、全部写入路径、审批与导入直调都能绕过数据范围（生产审计报告 S-04）。
 * 本组件下沉到服务层，{@code GenericController} 保留权限码与资产使用人兜底，形成双层防护。</p>
 *
 * <p>口径（Q1/Q2）：
 * <ul>
 *   <li>{@code ALL} → 全集团可见，不做公司过滤；未登录的内部调用放行（启动初始化、认证链路）。</li>
 *   <li>{@code COMPANY} → 本公司 + 全部下级 + 显式授权公司，按 {@code companyId IN} 过滤。</li>
 *   <li>{@code DEPT} → 本部门及子部门；{@code DEPT_ONLY}/{@code SELF} 沿用原有按人过滤。</li>
 *   <li>所有带 {@code companyId} 列的集合统一受公司维度约束，不再依赖 6 类前缀白名单。</li>
 *   <li>审批人待办例外从「整体放开」收紧为「仍按公司过滤，只放开经办人维度」。</li>
 * </ul>
 *
 * <p>无归属列的集合（字典、参数、流程模板、低值物品目录等）在 D1 暂不施加公司过滤，
 * 已在 {@code docs/qa/stage-gates.md} 登记为 D2 契约扩字段项，避免本期制造 schema 漂移。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RowScopeGuard {

    /**
     * 配置类集合（D2 集团默认 + 公司覆盖）：group 默认行 companyId 为空，
     * 必须对所有公司可见，因此读路径不施加公司过滤；写入归属校验由 PermissionPolicy 负责。
     */
    private static final java.util.Set<String> CONFIG_READ_UNSCOPED =
            new java.util.HashSet<>(java.util.Arrays.asList("system-params", "system-workflow-flows"));

    private final CompanyScopeResolver companies;

    private final ResourceRegistry registry;

    /**
     * 读列表：把范围条件强制写入 query，覆盖调用方传入的同名字段（无法用参数绕过）。
     *
     * @param companyView 顶栏公司视角；仅由对外查询入口传入，服务内部调用传空，
     *                    避免折旧计提、导入、数据重置等系统动作被展示视角误伤
     */
    public Map<String, String[]> scopeRaw(String key, ResourceMeta meta, Map<String, String[]> raw,
                                          String companyView) {
        UserPrincipal principal = AuthContext.current();
        if (principal == null || isAll(principal.getDataScope())
                || CONFIG_READ_UNSCOPED.contains(key) || !isBusinessCollection(key, meta)) {
            // 无视角时保持既有行为（原样返回，不做拷贝）
            if (companyView == null || companyView.trim().isEmpty()) {
                return raw;
            }
            // 全集团账号等不施加授权过滤，但仍要按公司视角收窄展示
            Map<String, String[]> viewOnly = raw == null ? new LinkedHashMap<>() : new LinkedHashMap<>(raw);
            applyCompanyView(principal, key, meta, viewOnly, companyView);
            return viewOnly;
        }
        Map<String, String[]> out = raw == null ? new LinkedHashMap<>() : new LinkedHashMap<>(raw);
        String scope = principal.getDataScope();
        if ("SELF".equalsIgnoreCase(scope)) {
            put(out, meta, "createBy", principal.getUsername());
        } else if ("DEPT".equalsIgnoreCase(scope)) {
            Set<String> depts = companies.visibleDeptIds(principal);
            if (depts != null && !depts.isEmpty() && meta.getAllColumns().contains("deptId")) {
                out.put("deptId", depts.toArray(new String[0]));
            }
        } else if ("DEPT_ONLY".equalsIgnoreCase(scope)
                && !approverNeedsUnscopedDocs(principal, key)) {
            if ("fixed-assets".equals(key)) {
                put(out, meta, "userId", principal.getId());
            } else if (meta.getAllColumns().contains("creatorId")) {
                put(out, meta, "creatorId", principal.getId());
            }
        }
        // 公司维度对所有带 companyId 的集合生效，与 dataScope 具体档位无关
        Set<String> visible = companies.visibleCompanyIds(principal);
        if (visible != null && !visible.isEmpty() && meta.getAllColumns().contains("companyId")) {
            out.put("companyId", visible.toArray(new String[0]));
        }
        // 公司视角：在授权范围之上按所选公司再收窄，不改变授权本身
        applyCompanyView(principal, key, meta, out, companyView);
        return out;
    }

    /**
     * 顶栏「公司视角」收窄：仅在授权公司集合内生效。
     *
     * <p>语义与 {@code COMPANY} 数据范围一致：<b>所选公司 + 全部下级</b>。
     * 例如集团根 → 全集团汇总；研究院 → 本院及 3 家子公司；子公司 → 本公司。
     * 这样各层级视角口径统一，不会出现「集团含下级、研究院不含下级」的割裂。</p>
     *
     * <p>安全边界：视角值不在本人可见集合内时直接忽略（不报错），
     * 服务端仍按授权集合返回；视角子树再与授权集合取交集，永不扩大权限。</p>
     */
    private void applyCompanyView(UserPrincipal principal, String key, ResourceMeta meta,
                                  Map<String, String[]> out, String companyView) {
        if (principal == null || !meta.getAllColumns().contains("companyId")
                || CONFIG_READ_UNSCOPED.contains(key)) {
            return;
        }
        String view = companyView == null ? "" : companyView.trim();
        if (view.isEmpty()) {
            return;
        }
        Set<String> visible = companies.visibleCompanyIds(principal);
        if (visible != null && !visible.contains(view)) {
            log.debug("[company-view] 忽略越权视角 {}（账号 {}）", view, principal.getUsername());
            return;
        }
        // 所选公司 + 全部下级：集团根自然覆盖全集团，无需特判
        Set<String> viewIds = new java.util.LinkedHashSet<>(companies.visibleCompanyIdsFor(view, null));
        if (visible != null) {
            // 双保险：视角子树不得超出本人授权集合（组织数据变更/脏数据时仍不越权）
            viewIds.retainAll(visible);
        }
        if (!viewIds.isEmpty()) {
            out.put("companyId", viewIds.toArray(new String[0]));
        }
    }



    /** 详情读取 / 删除前：目标行必须落在可见公司集合内 */
    public void assertRead(String key, Map<String, Object> row) {
        UserPrincipal principal = AuthContext.current();
        if (principal == null || isAll(principal.getDataScope()) || row == null) {
            return;
        }
        ResourceMeta meta = registry.resolve(key);
        if (!meta.getAllColumns().contains("companyId")) {
            return;
        }
        String companyId = text(row.get("companyId"));
        if (companyId.isEmpty()) {
            // 存量数据尚未补齐归属时先放行，D1 数据复核会核对并补值
            return;
        }
        if (!isCompanyVisible(companyId)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无权访问其他公司的数据");
        }
    }

    /**
     * 写入前：校验归属并防止归属被清空或伪造。
     *
     * @param payload 即将落库的行（camelCase 字段名）
     * @param stored  库中旧行，新增时为 {@code null}
     */
    public void assertWrite(String key, Map<String, Object> payload, Map<String, Object> stored) {
        if ("org-companies".equals(key) || "org-departments".equals(key)) {
            companies.invalidate();
        }
        UserPrincipal principal = AuthContext.current();
        if (principal == null || isAll(principal.getDataScope()) || payload == null) {
            return;
        }
        ResourceMeta meta = registry.resolve(key);
        if (!meta.getAllColumns().contains("companyId")) {
            return;
        }
        String previousCompany = stored == null ? "" : text(stored.get("companyId"));
        if (!previousCompany.isEmpty() && !isCompanyVisible(previousCompany)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无权修改其他公司的数据");
        }
        String nextCompany = text(payload.get("companyId"));
        if (nextCompany.isEmpty()) {
            // create 未填归属，或 update 全量替换把归属清掉：统一回填，避免挂错公司/丢归属
            String fallback = !previousCompany.isEmpty() ? previousCompany : principal.getCompanyId();
            if (!fallback.isEmpty()) {
                payload.put("companyId", fallback);
            }
            return;
        }
        if (!isCompanyVisible(nextCompany)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "不能把数据归属到其他公司");
        }
    }

    /** 单列直改：仅校验目标列本身，目标行由调用方用 assertRead 复核 */
    public void assertWriteField(String key, String field, Object value) {
        if (!"companyId".equals(field)) {
            return;
        }
        UserPrincipal principal = AuthContext.current();
        if (principal == null || isAll(principal.getDataScope()) || value == null) {
            return;
        }
        if (!isCompanyVisible(String.valueOf(value))) {
            throw new ApiException(ErrorCode.FORBIDDEN, "不能把数据归属到其他公司");
        }
    }

    /** 清空集合：非全集团范围账号一律拒绝（S-05） */
    public void assertClear(String key) {
        UserPrincipal principal = AuthContext.current();
        if (principal != null && !isAll(principal.getDataScope())) {
            throw new ApiException(ErrorCode.FORBIDDEN, "清空集合仅限全集团数据范围的账号：" + key);
        }
    }

    /** 组织主数据写入后失效范围缓存 */
    public void invalidateCompanies() {
        companies.invalidate();
    }

    /**
     * D2 审批角色池：候选用户 api 行是否覆盖单据公司。
     * 全集团账号（dataScope=ALL）放行；否则按其自身公司 + 授权公司展开下级后判定。
     */
    public boolean isUserCompanyEligible(Map<String, Object> user, String docCompanyId, String dataScope) {
        if (docCompanyId == null || docCompanyId.trim().isEmpty() || user == null) {
            return true;
        }
        if (isAll(dataScope)) {
            return true;
        }
        java.util.Collection<String> extras = new java.util.ArrayList<>();
        Object raw = user.get("scopeCompanyIds");
        if (raw instanceof Iterable) {
            for (Object o : (Iterable<?>) raw) {
                if (o != null) {
                    extras.add(text(o));
                }
            }
        } else if (raw instanceof String && !text(raw).isEmpty()) {
            String json = text(raw);
            try {
                com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                java.util.List<?> parsed = om.readValue(json, java.util.List.class);
                for (Object o : parsed) {
                    if (o != null) {
                        extras.add(text(o));
                    }
                }
            } catch (Exception e) {
                log.warn("[company-scope] 用户授权公司字段解析失败: {}", json);
            }
        }
        Set<String> visible = companies.visibleCompanyIdsFor(text(user.get("companyId")), extras);
        return visible.contains(docCompanyId);
    }

    /**
     * 岗位公司是否覆盖单据公司：岗位所在公司及其全部下级公司算覆盖。
     *
     * <p>用于一人多岗的审批角色池：某人在 A 公司某部门任领导岗，A 及其下级的单据
     * 都能由该岗位身份审批；B 公司（非 A 下级）的单据则不能借用 A 的岗位角色。</p>
     */
    public boolean isCompanyCovered(String positionCompanyId, String docCompanyId) {
        if (docCompanyId == null || docCompanyId.trim().isEmpty()) {
            return true;
        }
        if (positionCompanyId == null || positionCompanyId.trim().isEmpty()) {
            return false;
        }
        if (positionCompanyId.equals(docCompanyId)) {
            return true;
        }
        return companies.visibleCompanyIdsFor(positionCompanyId, null).contains(docCompanyId);
    }

    /** 角色成员池按公司过滤时使用 */
    public boolean isCompanyVisible(Object companyId) {
        UserPrincipal principal = AuthContext.current();
        String value = text(companyId);
        if (principal == null || isAll(principal.getDataScope()) || value.isEmpty()) {
            return true;
        }
        Set<String> visible = companies.visibleCompanyIds(principal);
        return visible == null || visible.contains(value);
    }

    /**
     * 审批人待办例外：{@code DEPT_ONLY} + {@code wm:todo} 的账号必须能看到
     * 「别人提交但当前环节点名到本人」的单据，否则工作台待办恒空。
     * 改造前这里直接返回原始 query（跨公司数据一并可见），现在只放开经办人维度，
     * 公司维度仍由 {@link #scopeRaw} 施加。
     */
    public boolean approverNeedsUnscopedDocs(UserPrincipal principal, String key) {
        return principal != null
                && "DEPT_ONLY".equalsIgnoreCase(principal.getDataScope())
                && key != null && key.startsWith("fixed-asset-doc-lists-")
                && principal.getAuthorities().stream().anyMatch(a -> "wm:todo".equals(a.getAuthority()));
    }

    /**
     * 是否属于需要行级范围的业务集合。
     * 有 {@code companyId} 列的集合一律纳入；另保留无归属列但需按部门/经办人过滤的
     * 低值三类单据与固资单据前缀（D2 补归属列前不能漏掉）。
     */
    private static boolean isBusinessCollection(String key, ResourceMeta meta) {
        if (meta.getAllColumns().contains("companyId")) {
            return true;
        }
        return key != null && (key.equals("fixed-assets")
                || key.startsWith("fixed-asset-doc-lists-")
                || key.startsWith("low-value-"));
    }

    private static void put(Map<String, String[]> out, ResourceMeta meta, String field, String value) {
        if (value == null || value.isEmpty() || !meta.getAllColumns().contains(field)) {
            return;
        }
        out.put(field, new String[]{value});
    }

    private static boolean isAll(String scope) {
        return scope == null || scope.isEmpty() || "ALL".equalsIgnoreCase(scope);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
