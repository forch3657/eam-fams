package com.fams.module.approval;

import com.fams.common.ApiException;
import com.fams.engine.GenericService;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 审批人解析：把「审批人」从全局角色成员改为「按单据归属部门解析到具体的人」。
 *
 * <p>环节配置 {@code approverType}：</p>
 * <ul>
 *   <li>{@code ROLE}（缺省，兼容历史流程）：持有 {@code approverRoleId} 的全部启用用户；</li>
 *   <li>{@code DEPT_LEADER}：单据归属部门的负责人 {@code org_departments.leader_id}；</li>
 *   <li>{@code PARENT_DEPT_LEADER}：上级部门的负责人；</li>
 *   <li>{@code DEPT_VP}：单据归属部门的分管领导 {@code vp_id}，为空时向上找父部门；</li>
 *   <li>{@code USER}：环节上指定的固定审批人 {@code approverId}。</li>
 * </ul>
 *
 * <p>部门维度解析出的是<b>唯一审批人</b>，不再受 {@code mode=ANY} 影响：
 * 任意一位「部门主管」都能批别的部门，正是本次要修掉的问题。</p>
 */
public final class ApproverResolver {

    public static final String DEPTS = "org-departments";

    public static final String USERS = "org-users";

    public static final String ASSETS = "fixed-assets";

    public static final String TYPE_ROLE = "ROLE";

    public static final String TYPE_DEPT_LEADER = "DEPT_LEADER";

    /** 父部门链最大深度，防止组织数据成环时死循环 */
    private static final int MAX_DEPT_DEPTH = 12;

    private ApproverResolver() {
    }

    /** 环节是否按「组织里的人」解析（唯一审批人） */
    public static boolean isPersonScoped(Map<String, Object> step) {
        String type = typeOf(step);
        return TYPE_DEPT_LEADER.equals(type) || "PARENT_DEPT_LEADER".equals(type)
                || "DEPT_VP".equals(type) || "USER".equals(type);
    }

    /**
     * 单据归属部门：单据自身的 deptId → 资产的 deptId → 创建人所属部门。
     *
     * <p>固资单据（派发/退库/借出…）表里没有 dept_id，必须先看资产；
     * 低值单据自带 dept_id；都没有时退回创建人部门。</p>
     */
    public static String deptIdOf(GenericService service, Map<String, Object> doc) {
        if (doc == null) {
            return "";
        }
        String deptId = text(doc.get("deptId"));
        if (!deptId.isEmpty()) {
            return deptId;
        }
        String assetDept = text(read(service, ASSETS, text(doc.get("assetId"))).get("deptId"));
        if (!assetDept.isEmpty()) {
            return assetDept;
        }
        return text(read(service, USERS, text(doc.get("creatorId"))).get("deptId"));
    }

    /** 按环节配置解析审批人集合；解析不到返回空集合（由调用方决定报错还是放行） */
    public static Set<String> resolve(GenericService service, Map<String, Object> step, String deptId) {
        Set<String> ids = new LinkedHashSet<>();
        if (step == null) {
            return ids;
        }
        switch (typeOf(step)) {
            case TYPE_DEPT_LEADER:
                addDeptPerson(service, ids, deptId, "leaderId");
                break;
            case "PARENT_DEPT_LEADER":
                addDeptPerson(service, ids, parentOf(service, deptId), "leaderId");
                break;
            case "DEPT_VP":
                addVp(service, ids, deptId);
                break;
            case "USER":
                addUser(service, ids, text(step.get("approverId")));
                break;
            case TYPE_ROLE:
            default:
                ids.addAll(service.userIdsOfRole(text(step.get("approverRoleId"))));
                break;
        }
        return ids;
    }

    /** 解析不到审批人的环节名称，用于提交时一次性提示 */
    public static List<String> unresolvedStepNames(GenericService service,
                                                   List<Map<String, Object>> steps, String deptId) {
        List<String> names = new ArrayList<>();
        for (Map<String, Object> step : steps) {
            if (resolve(service, step, deptId).isEmpty()) {
                names.add(text(step.get("name")) + "（" + personLabel(step.get("approverType")) + "）");
            }
        }
        return names;
    }

    /** 环节审批人的口语化描述，用于 403/400 文案 */
    public static String personLabel(Object approverType) {
        String type = text(approverType).toUpperCase(Locale.ROOT);
        if (type.isEmpty()) {
            return TYPE_ROLE;
        }
        switch (type) {
            case TYPE_DEPT_LEADER:
                return "部门负责人";
            case "PARENT_DEPT_LEADER":
                return "上级部门负责人";
            case "DEPT_VP":
                return "分管领导";
            case "USER":
                return "指定审批人";
            default:
                return "角色成员";
        }
    }

    /** 用户姓名，找不到返回空串 */
    public static String userNameOf(GenericService service, String userId) {
        return text(read(service, USERS, userId).get("name"));
    }

    // ------------------------------------------------------------------ 内部

    private static String typeOf(Map<String, Object> step) {
        String type = text(step.get("approverType")).toUpperCase(Locale.ROOT);
        return type.isEmpty() ? TYPE_ROLE : type;
    }

    private static void addDeptPerson(GenericService service, Set<String> ids, String deptId, String field) {
        if (text(deptId).isEmpty()) {
            return;
        }
        addUser(service, ids, text(read(service, DEPTS, deptId).get(field)));
    }

    /** 分管领导：本部门没有就向上找，直到公司级/根部门 */
    private static void addVp(GenericService service, Set<String> ids, String deptId) {
        String cursor = text(deptId);
        int depth = 0;
        while (!cursor.isEmpty() && depth++ < MAX_DEPT_DEPTH) {
            Map<String, Object> dept = read(service, DEPTS, cursor);
            if (dept.isEmpty()) {
                return;
            }
            String vpId = text(dept.get("vpId"));
            if (!vpId.isEmpty()) {
                addUser(service, ids, vpId);
                return;
            }
            cursor = text(dept.get("parentId"));
        }
    }

    private static String parentOf(GenericService service, String deptId) {
        return text(read(service, DEPTS, deptId).get("parentId"));
    }

    private static void addUser(GenericService service, Set<String> ids, String userId) {
        String id = text(userId);
        if (id.isEmpty()) {
            return;
        }
        Map<String, Object> user = read(service, USERS, id);
        if (user.isEmpty() || !"ENABLED".equals(text(user.get("status")))) {
            return;
        }
        ids.add(id);
    }

    /** 读一条记录，不存在或无权读取时返回空 Map */
    private static Map<String, Object> read(GenericService service, String key, String id) {
        if (service == null || id == null || id.trim().isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            Map<String, Object> row = service.get(key, id);
            return row == null ? Collections.emptyMap() : row;
        } catch (ApiException e) {
            return Collections.emptyMap();
        }
    }

    private static String text(Object value) {
        return ApprovalSupport.text(value);
    }
}
