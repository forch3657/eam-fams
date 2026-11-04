package com.fams.module.approval;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 审批链解析：单据类型 → 集合 → 流程 → 生效环节 → 当前待审环节。
 *
 * <p>口径与前端 services/approval.js 一一对应：
 * 按 bizType 取第一条启用流程，按环节触发条件过滤，
 * ANY / SEQUENCE 一人通过即过，ALL 需全员通过。</p>
 */
public final class ApprovalSupport {

    /** 单据类型 → 集合 key */
    private static final Map<String, String> COLLECTION_OF_DOC = new HashMap<>();

    /** 单据类型 → 审批业务类型 */
    private static final Map<String, String> BIZ_OF_DOC = new HashMap<>();

    /** 集合 key → 单据类型 */
    private static final Map<String, String> DOC_OF_COLLECTION = new HashMap<>();

    static {
        map("inbound", "fixed-asset-doc-lists-inbound", "INBOUND");
        map("alloc", "fixed-asset-doc-lists-alloc", "DISPATCH");
        map("back", "fixed-asset-doc-lists-back", "RETURN");
        map("borrow", "fixed-asset-doc-lists-borrow", "BORROW");
        map("transfer", "fixed-asset-doc-lists-transfer", "TRANSFER");
        map("repair", "fixed-asset-doc-lists-repair", "REPAIR");
        map("change", "fixed-asset-doc-lists-change", "CHANGE");
        map("dispose", "fixed-asset-doc-lists-dispose", "DISPOSE");
        map("inventory", "fixed-asset-inventory-docs", "INVENTORY");
        map("requisition", "low-value-requisition", "REQUISITION");
        map("return", "low-value-return", "LV_RETURN");
    }

    private ApprovalSupport() {
    }

    private static void map(String docKey, String collection, String bizType) {
        COLLECTION_OF_DOC.put(docKey, collection);
        BIZ_OF_DOC.put(docKey, bizType);
        DOC_OF_COLLECTION.put(collection, docKey);
    }

    /** 参与审批轨迹生成的单据类型 */
    public static Set<String> docKeys() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(COLLECTION_OF_DOC.keySet()));
    }

    /** 参与审批轨迹生成的**集合 key**（钩子按集合 key 注册） */
    public static Set<String> approvalCollections() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(COLLECTION_OF_DOC.values()));
    }

    /** 单据类型 → 集合 key */
    public static String collectionOf(String docKey) {
        return docKey == null ? null : COLLECTION_OF_DOC.get(docKey.trim());
    }

    /** 单据类型 → 审批业务类型 */
    public static String bizTypeOf(String docKey) {
        return docKey == null ? null : BIZ_OF_DOC.get(docKey.trim());
    }

    /** 集合 key → 单据类型 */
    public static String docKeyOf(String collection) {
        return collection == null ? null : DOC_OF_COLLECTION.get(collection.trim());
    }

    /** 取业务类型对应的启用流程 */
    public static Map<String, Object> flowOf(GenericService service, String flowsKey, String bizType) {
        for (Map<String, Object> flow : service.list(flowsKey, Collections.emptyMap())) {
            if (bizType != null && bizType.equals(text(flow.get("bizType"))) && truthy(flow.get("enabled"))) {
                return flow;
            }
        }
        throw new ApiException(ErrorCode.BAD_REQUEST,
                "该业务类型没有启用的审批流程，请先在「系统管理 → 流程配置」中配置");
    }

    /** 按触发条件过滤生效环节 */
    public static List<Map<String, Object>> effectiveSteps(Map<String, Object> flow, Map<String, Object> ctx) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> step : stepsOf(flow)) {
            if (stepApplies(step, ctx)) {
                result.add(step);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> stepsOf(Map<String, Object> flow) {
        if (flow == null) {
            return Collections.emptyList();
        }
        Object raw = flow.get("steps");
        if (raw instanceof List) {
            return (List<Map<String, Object>>) raw;
        }
        if (raw instanceof String) {
            Object parsed = RowCodec.parseJsonSafe((String) raw);
            if (parsed instanceof List) {
                return (List<Map<String, Object>>) parsed;
            }
        }
        return Collections.emptyList();
    }

    /** 环节触发条件：AMOUNT_GT 金额门槛 / HAS_DIFF 存在盘点差异 */
    public static boolean stepApplies(Map<String, Object> step, Map<String, Object> ctx) {
        String type = text(step.get("conditionType"));
        if (type.isEmpty() || "NONE".equals(type)) {
            return true;
        }
        if (ctx == null) {
            return false;
        }
        if ("AMOUNT_GT".equals(type)) {
            BigDecimal threshold = RowCodec.toBigDecimal(step.get("conditionValue"));
            if (threshold == null) {
                threshold = RowCodec.toBigDecimal(step.get("amountLimit"));
            }
            BigDecimal amount = RowCodec.toBigDecimal(ctx.get("amount"));
            if (threshold == null || amount == null) {
                return true;
            }
            return amount.compareTo(threshold) > 0;
        }
        return "HAS_DIFF".equals(type) && truthy(ctx.get("hasDiff"));
    }

    /** 当前待审环节；全部通过时返回 null。deptId 用于按部门解析审批人。 */
    public static Map<String, Object> currentStep(List<Map<String, Object>> steps,
                                                  List<Map<String, Object>> approvals,
                                                  GenericService service,
                                                  String deptId) {
        for (Map<String, Object> step : steps) {
            String key = text(step.get("key"));
            Set<String> agreedBy = new LinkedHashSet<>();
            for (Map<String, Object> approval : approvals) {
                boolean sameStep = key.equals(text(approval.get("stepKey")));
                boolean agreed = "AGREE".equals(text(approval.get("result")));
                if (sameStep && agreed) {
                    agreedBy.add(text(approval.get("approverId")));
                }
            }
            if (agreedBy.isEmpty()) {
                return step;
            }
            if ("ALL".equals(text(step.get("mode")))) {
                Set<String> approvers = approverIdsOf(step, approvals, service, deptId);
                if (!approvers.isEmpty() && !agreedBy.containsAll(approvers)) {
                    return step;
                }
            }
        }
        return null;
    }

    /**
     * 环节的实际审批人集合。
     *
     * <p>角色成员为基础；存在转办时由最后一次转办目标替换基础集合；
     * 转办之后（或从未转办时）的加签目标追加进集合，参与 ANY / ALL 判定。</p>
     *
     * <p>基础集合按 {@code approverType} 解析：默认 ROLE 用角色成员；
     * DEPT_LEADER / DEPT_VP 等按单据归属部门解析到具体的人（唯一审批人）。</p>
     */
    public static Set<String> approverIdsOf(Map<String, Object> step, List<Map<String, Object>> approvals,
                                            GenericService service, String deptId) {
        Set<String> ids = new LinkedHashSet<>();
        String key = text(step.get("key"));
        Map<String, Object> lastTransfer = null;
        List<Map<String, Object>> stepRecords = new ArrayList<>();
        for (Map<String, Object> record : approvals) {
            if (!key.equals(text(record.get("stepKey")))) {
                continue;
            }
            stepRecords.add(record);
            if ("TRANSFER".equals(text(record.get("result")))) {
                lastTransfer = record;
            }
        }
        if (lastTransfer != null) {
            String target = text(lastTransfer.get("targetUserId"));
            if (!target.isEmpty()) {
                ids.add(target);
            }
        } else {
            ids.addAll(ApproverResolver.resolve(service, step, deptId));
        }
        boolean afterTransfer = lastTransfer == null;
        for (Map<String, Object> record : stepRecords) {
            if (record == lastTransfer) {
                afterTransfer = true;
                continue;
            }
            if (afterTransfer && "ADD_SIGN".equals(text(record.get("result")))) {
                String target = text(record.get("targetUserId"));
                if (!target.isEmpty()) {
                    ids.add(target);
                }
            }
        }
        String fixedApprover = text(step.get("approverId"));
        if (!fixedApprover.isEmpty()) {
            ids.add(fixedApprover);
        }
        return ids;
    }

    /** 该单据已有的审批记录 */
    public static List<Map<String, Object>> approvalsOf(GenericService service, String approvalsKey,
                                                       String docKey, String docId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : service.list(approvalsKey, Collections.emptyMap())) {
            boolean sameDoc = docKey.equals(text(row.get("docKey"))) && docId.equals(text(row.get("docId")));
            if (sameDoc) {
                out.add(row);
            }
        }
        return out;
    }

    public static String roleNameOf(GenericService service, String rolesKey, Object roleId) {
        String id = text(roleId);
        if (id.isEmpty()) {
            return "";
        }
        for (Map<String, Object> role : service.list(rolesKey, Collections.emptyMap())) {
            if (id.equals(text(role.get("id")))) {
                return text(role.get("name"));
            }
        }
        return id;
    }

    public static String docCodeOf(Map<String, Object> doc) {
        String code = text(doc.get("code"));
        return code.isEmpty() ? text(doc.get("docNo")) : code;
    }

    public static String text(Object value) {
        return ApprovalText.text(value);
    }

    public static String trim(String value) {
        return ApprovalText.trim(value);
    }

    public static boolean truthy(Object value) {
        return ApprovalText.truthy(value);
    }
}
