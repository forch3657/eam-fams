package com.fams.imports;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据重置（危险操作）：首次上线前清理演示 / 历史业务数据，避免逐条删除。
 *
 * <p>权限：仅系统管理员（ROLE_ADMIN）可执行。</p>
 *
 * <p>范围严格限定为「业务数据」，按依赖顺序删除：
 * <ul>
 *   <li>固定资产：8 类单据 → 审批记录 → 盘点 → 折旧报表 → 资产台账 → 存放地点</li>
 *   <li>低值资产：退库 → 领用 → 入库 → 物品 → 存放位置</li>
 *   <li>组织架构：其余用户 → 部门 → 公司（保留当前登录的 admin 账号，并清空其公司/部门归属）</li>
 * </ul>
 *
 * <p><b>不删除</b>：角色、系统参数、字典、流程、消息模板、折旧方案/规则、资产分类、位置候选项等通用基础配置。
 * 组织架构单独清空会被固定资产 / 低值单据阻断（它们引用了公司/部门/人员），
 * 需要先清对应模块，或直接使用「清空全部业务数据」。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DataResetService {

    public static final String SCOPE_ORG = "org";
    public static final String SCOPE_LOW_VALUE = "low-value";
    public static final String SCOPE_FIXED_ASSET = "fixed-asset";
    public static final String SCOPE_ALL = "all";

    private static final String USERS = "org-users";
    private static final String DEPARTMENTS = "org-departments";
    private static final String COMPANIES = "org-companies";
    private static final String ROLES = "org-roles";
    private static final String ADMIN_ROLE_CODE = "ROLE_ADMIN";

    private static final String ITEMS = LowValueAssetImportService.ITEMS;
    private static final String ASSETS = FixedAssetImportService.ASSETS;
    /** 站内消息：只在「清空全部业务数据」时清空（消息模板属于基础配置，保留） */
    private static final String MESSAGES = "notify-messages";
    /** 操作日志：只在「清空全部业务数据」时清空（单独清某个模块不抹掉审计痕迹） */
    private static final String LOGS = "operation-logs";

    /** 固定资产：先删单据/结果，再删台账，最后删地点 */
    private static final List<String[]> FIXED_RESOURCES = Collections.unmodifiableList(Arrays.asList(
            new String[]{"fixed-asset-doc-lists-inbound", "固定资产-入库单"},
            new String[]{"fixed-asset-doc-lists-alloc", "固定资产-派发单"},
            new String[]{"fixed-asset-doc-lists-back", "固定资产-退库单"},
            new String[]{"fixed-asset-doc-lists-borrow", "固定资产-借出单"},
            new String[]{"fixed-asset-doc-lists-transfer", "固定资产-调拨单"},
            new String[]{"fixed-asset-doc-lists-repair", "固定资产-维修单"},
            new String[]{"fixed-asset-doc-lists-change", "固定资产-变更单"},
            new String[]{"fixed-asset-doc-lists-dispose", "固定资产-处置单"},
            new String[]{"fixed-asset-doc-approvals", "固定资产-审批记录"},
            new String[]{"fixed-asset-inventory-docs", "固定资产-盘点单"},
            new String[]{"fixed-asset-inventory-plans", "固定资产-盘点计划"},
            new String[]{"fixed-asset-depreciation-reports", "固定资产-折旧报表"},
            new String[]{"fixed-asset-report-depreciation-details", "固定资产-折旧明细"},
            new String[]{"fixed-asset-report-depreciation-plan-details", "固定资产-方案折旧明细"},
            new String[]{ASSETS, "固定资产台账"},
            new String[]{"fixed-asset-settings-locations", "固定资产-存放地点"}
    ));

    /** 低值资产：先删单据，再删物品，最后删位置 */
    private static final List<String[]> LOW_VALUE_RESOURCES = Collections.unmodifiableList(Arrays.asList(
            new String[]{"low-value-return", "低值-退库单"},
            new String[]{"low-value-requisition", "低值-领用单"},
            new String[]{"low-value-inbound", "低值-入库单"},
            new String[]{ITEMS, "低值物品"},
            new String[]{"low-value-settings-locations", "低值-存放位置"}
    ));

    private final GenericService genericService;

    // ---------------------------------------------------------------- 预览

    /** 统计将被清除的数据量；blockers 非空表示当前范围不能直接执行 */
    public ResetPreview preview(String scope) {
        assertAdmin();
        String normalized = normalizeScope(scope);
        ResetPreview preview = new ResetPreview();
        preview.scope = normalized;

        if (SCOPE_FIXED_ASSET.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            for (String[] resource : FIXED_RESOURCES) {
                addItem(preview, resource[0], resource[1]);
            }
        }
        if (SCOPE_LOW_VALUE.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            for (String[] resource : LOW_VALUE_RESOURCES) {
                addItem(preview, resource[0], resource[1]);
            }
        }
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            addOrgItems(preview);
        }
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            addItem(preview, MESSAGES, "站内消息");
        }
        if (SCOPE_ALL.equals(normalized)) {
            addItem(preview, LOGS, "操作日志");
        }

        for (ResetPreview.Item item : preview.items) {
            preview.total += item.count;
        }

        if (SCOPE_ORG.equals(normalized)) {
            checkOrgBlockers(preview);
        }
        preview.notes.add("角色、系统参数、字典、流程模板、折旧方案、资产分类等通用基础配置不会被清空。");
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            preview.notes.add("用户被清空后，站内消息（我的消息 / 消息中心）会一并清空，消息模板保留。");
        }
        if (SCOPE_ALL.equals(normalized)) {
            preview.notes.add("「操作日志」会一并清空；清空后访问页面仍会产生新的日志。");
        }
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            preview.notes.add("当前登录的 admin 账号会保留，其公司/部门归属会被清空，清空后请在「用户管理」中重新指定。");
        }
        preview.notes.add("清空不可恢复，建议先备份数据库。");
        return preview;
    }

    private void addItem(ResetPreview preview, String key, String label) {
        int count = count(key);
        if (count > 0) {
            preview.items.add(new ResetPreview.Item(key, label, count));
        }
    }

    private void addOrgItems(ResetPreview preview) {
        String currentId = AuthContext.currentUserId();
        int users = 0;
        for (Map<String, Object> row : list(USERS)) {
            if (currentId != null && currentId.equals(str(row.get("id")))) {
                continue;
            }
            users++;
        }
        if (users > 0) {
            preview.items.add(new ResetPreview.Item(USERS, "用户（保留当前 admin 账号）", users));
        }
        addItem(preview, DEPARTMENTS, "部门");
        addItem(preview, COMPANIES, "公司");
    }

    /** 组织架构被引用时不允许直接清空，避免资产/单据出现悬空的公司、部门、人员 */
    private void checkOrgBlockers(ResetPreview preview) {
        int fixed = 0;
        for (String[] resource : FIXED_RESOURCES) {
            fixed += count(resource[0]);
        }
        if (fixed > 0) {
            preview.blockers.add("固定资产模块还有 " + fixed + " 条数据引用了公司/部门/人员，请先清空固定资产，或改用「清空全部业务数据」");
        }
        int lowDocs = count("low-value-requisition") + count("low-value-return");
        if (lowDocs > 0) {
            preview.blockers.add("低值领用/退库单还有 " + lowDocs + " 条数据引用了部门/人员，请先清空低值资产，或改用「清空全部业务数据」");
        }
    }

    // ---------------------------------------------------------------- 执行

    /**
     * 执行清空：整批在一个事务内完成，任一步失败则整体回滚。
     *
     * @param scope org / low-value / fixed-asset / all
     */
    @Transactional
    public ResetResult reset(String scope) {
        assertAdmin();
        String normalized = normalizeScope(scope);
        ResetPreview preview = preview(normalized);
        if (!preview.blockers.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, String.join("；", preview.blockers));
        }

        ResetResult result = new ResetResult();
        result.scope = normalized;
        for (ResetPreview.Item item : preview.items) {
            result.deletedByResource.put(item.key, item.count);
            result.deleted += item.count;
        }

        if (SCOPE_FIXED_ASSET.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            for (String[] resource : FIXED_RESOURCES) {
                genericService.clear(resource[0]);
            }
        }
        if (SCOPE_LOW_VALUE.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            for (String[] resource : LOW_VALUE_RESOURCES) {
                genericService.clear(resource[0]);
            }
        }
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            resetOrg();
        }
        if (SCOPE_ORG.equals(normalized) || SCOPE_ALL.equals(normalized)) {
            // 用户已被清空，消息失去接收者；否则消息中心 / 顶栏未读数仍停留在旧数据
            genericService.clear(MESSAGES);
        }
        if (SCOPE_ALL.equals(normalized)) {
            genericService.clear(LOGS);
        }

        log.warn("数据重置完成：scope={}，共清除 {} 条（操作人 {}）",
                normalized, result.deleted, AuthContext.currentUsername());
        return result;
    }

    /** 保留当前登录的 admin 账号；其余用户、部门、公司全部清空 */
    private void resetOrg() {
        String currentId = AuthContext.currentUserId();
        for (Map<String, Object> row : list(USERS)) {
            String id = str(row.get("id"));
            if (currentId != null && currentId.equals(id)) {
                continue;
            }
            genericService.deleteByIdQuietly(USERS, id);
        }
        if (currentId != null && !currentId.isEmpty()) {
            // 公司/部门已被清空，把当前账号的组织归属一并置空，避免指向不存在的记录
            genericService.patchField(USERS, currentId, "companyId", null);
            genericService.patchField(USERS, currentId, "deptId", null);
        }
        genericService.clear(DEPARTMENTS);
        genericService.clear(COMPANIES);
    }

    // ---------------------------------------------------------------- 权限

    /** 仅系统管理员（ROLE_ADMIN）可执行清空 */
    private void assertAdmin() {
        String userId = AuthContext.currentUserId();
        if (userId == null || userId.isEmpty()) {
            throw new ApiException(ErrorCode.FORBIDDEN, "未登录，不能执行清空操作");
        }
        for (Map<String, Object> role : genericService.list(ROLES, new HashMap<String, String[]>())) {
            if (ADMIN_ROLE_CODE.equals(str(role.get("code")))
                    && genericService.userHasRole(userId, str(role.get("id")))) {
                return;
            }
        }
        throw new ApiException(ErrorCode.FORBIDDEN, "仅系统管理员（ROLE_ADMIN）可执行清空操作");
    }

    // ---------------------------------------------------------------- 工具

    private int count(String key) {
        return list(key).size();
    }

    private List<Map<String, Object>> list(String key) {
        return genericService.list(key, new HashMap<String, String[]>());
    }

    private static String normalizeScope(String scope) {
        String value = scope == null ? "" : scope.trim();
        if (SCOPE_ORG.equals(value) || SCOPE_LOW_VALUE.equals(value)
                || SCOPE_FIXED_ASSET.equals(value) || SCOPE_ALL.equals(value)) {
            return value;
        }
        throw new ApiException(ErrorCode.VALIDATION, "未知的清空范围：" + scope);
    }

    private static String str(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    // ---------------------------------------------------------------- DTO

    /** 清空预览：逐资源条数 + 阻断项 + 提示 */
    public static class ResetPreview {
        public String scope;
        public int total;
        public List<Item> items = new ArrayList<>();
        public List<String> blockers = new ArrayList<>();
        public List<String> notes = new ArrayList<>();

        public static class Item {
            public String key;
            public String label;
            public int count;

            public Item(String key, String label, int count) {
                this.key = key;
                this.label = label;
                this.count = count;
            }
        }
    }

    /** 清空结果 */
    public static class ResetResult {
        public String scope;
        public int deleted;
        public Map<String, Integer> deletedByResource = new LinkedHashMap<>();
    }
}
