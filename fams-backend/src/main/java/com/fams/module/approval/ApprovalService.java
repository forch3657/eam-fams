package com.fams.module.approval;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;

/**
 * 审批动作服务（契约 5.6）。
 *
 * <p>把「审批」作为**业务动作**而非两次 CRUD：一次请求内完成
 * 流程解析 → 环节定位 → 权限校验 → 单据状态推进 → 审批轨迹落库，
 * 任一步失败整体回滚，不会出现「状态改了但轨迹没记」。</p>
 *
 * <p>单据若绕过本端点、直接走通用 CRUD 改状态，
 * 则由 {@link com.fams.hook.ApprovalTrailHook} 兜底补记轨迹。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApprovalService {

    public static final String APPROVALS = "fixed-asset-doc-approvals";

    public static final String FLOWS = "system-workflow-flows";

    /** 台账集合：固资单据完结后回写使用人/状态 */
    private static final String ASSETS = "fixed-assets";

    private final GenericService genericService;

    private final ApprovalTrailWriter trailWriter;

    /**
     * 执行审批动作。
     *
     * @return {@code { ok, status, message }}
     * @throws ApiException 权限不足 403 / 状态非法 409 / 参数缺失 400 / 单据不存在 404
     */
    @Transactional
    public Map<String, Object> act(ApprovalRequest request) {
        String docKey = text(request.getDocKey());
        String docId = text(request.getDocId());
        String action = text(request.getAction());
        String comment = request.getComment() == null ? "" : request.getComment().trim();

        String collection = ApprovalSupport.collectionOf(docKey);
        if (collection == null) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "不支持审批的单据类型：" + docKey);
        }
        if (docId.isEmpty()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "缺少单据主键 docId");
        }
        Map<String, Object> previous = genericService.get(collection, docId);
        String oldStatus = text(previous.get("status"));
        String bizType = text(request.getBizType()).isEmpty()
                ? ApprovalSupport.bizTypeOf(docKey)
                : text(request.getBizType());
        Map<String, Object> flow = ApprovalSupport.flowOf(genericService, FLOWS, bizType);
        List<Map<String, Object>> steps = ApprovalSupport.effectiveSteps(flow, request.getCtx());
        List<Map<String, Object>> approvals =
                ApprovalSupport.approvalsOf(genericService, APPROVALS, docKey, docId);
        // 单据归属部门：部门负责人 / 分管领导按这个部门解析
        String deptId = ApproverResolver.deptIdOf(genericService, previous);
        Map<String, Object> current = ApprovalSupport.currentStep(steps, approvals, genericService, deptId);

        // 加签 / 转办 / 抄送：只写轨迹，不推进单据状态
        if ("addSign".equals(action) || "transfer".equals(action) || "cc".equals(action)) {
            return collaborate(request, docKey, docId, action, comment, previous, oldStatus,
                    flow, current, bizType, approvals, deptId);
        }

        String result;
        Map<String, Object> step;
        String stepName;
        String nextStatus;

        if ("submit".equals(action)) {
            if (!"DRAFT".equals(oldStatus) && !"REJECTED".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有草稿或已驳回的单据可以提交审批");
            }
            requireInitiator(previous, flow);
            if (steps.isEmpty()) {
                throw new ApiException(ErrorCode.BAD_REQUEST, "该流程没有可用环节，请检查流程配置");
            }
            // 提交前预解析全部生效环节：没有审批人就不让提交，避免单据卡在中间没人能批
            List<String> unresolved = ApproverResolver.unresolvedStepNames(genericService, steps, deptId);
            if (!unresolved.isEmpty()) {
                throw new ApiException(ErrorCode.BAD_REQUEST,
                        "以下环节没有可用的审批人，请先在「组织架构」中指定：" + String.join("、", unresolved));
            }
            result = "SUBMIT";
            step = null;
            stepName = "提交申请";
            nextStatus = "PROCESSING";
        } else if ("revoke".equals(action)) {
            if (!"PROCESSING".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以撤销");
            }
            requireInitiator(previous, flow);
            result = "REVOKE";
            step = null;
            stepName = "撤销申请";
            nextStatus = "REVOKED";
        } else if ("reject".equals(action)) {
            if (!"PROCESSING".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以审批");
            }
            if (current == null) {
                throw new ApiException(ErrorCode.CONFLICT, "该单据已无待审环节");
            }
            requireApprover(current, approvals, deptId);
            if (comment.isEmpty()) {
                throw new ApiException(ErrorCode.VALIDATION, "驳回必须填写意见");
            }
            result = "REJECT";
            step = current;
            stepName = text(current.get("name"));
            nextStatus = "REJECTED";
        } else if ("approve".equals(action)) {
            if (!"PROCESSING".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以审批");
            }
            if (current == null) {
                // 全部环节已通过：补一条终审记录后完结，保证轨迹闭环
                result = "AGREE";
                step = null;
                stepName = "审批完成";
                nextStatus = "DONE";
            } else {
                requireApprover(current, approvals, deptId);
                result = "AGREE";
                step = current;
                stepName = text(current.get("name"));
                nextStatus = isLastStep(steps, current) ? "DONE" : "PROCESSING";
            }
        } else {
            throw new ApiException(ErrorCode.BAD_REQUEST, "不支持的审批动作：" + action);
        }

        Map<String, Object> next = new LinkedHashMap<>(previous);
        next.put("status", nextStatus);
        LocalDateTime finishedAt = "PROCESSING".equals(nextStatus) ? null : LocalDateTime.now();
        next.put("finishTime", finishedAt);
        // 低值单据契约用 settleTime（表中无 finishTime 列），审批完结时同步写入
        if (collection.startsWith("low-value-")) {
            next.put("settleTime", finishedAt);
        }
        genericService.updateQuietly(collection, docId, next);

        // 固资单据完结后联动台账（派发/退库/借出）
        if ("DONE".equals(nextStatus)) {
            syncAssetLedger(bizType, previous);
        }

        ApprovalTrailWriter writer = trailWriter;
        Map<String, Object> trail = writer.write(docKey, docId, ApprovalSupport.docCodeOf(previous), bizType,
                flow, step, result, comment);
        return result(nextStatus, messageOf(action, nextStatus, stepName), trail);
    }

    private static Map<String, Object> result(String status, String message, Map<String, Object> trail) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        payload.put("status", status);
        payload.put("message", message);
        payload.put("trail", trail);
        return payload;
    }

    private static String messageOf(String action, String status, String stepName) {
        if ("submit".equals(action) || "revoke".equals(action)) {
            return "submit".equals(action) ? "已提交审批" : "单据已撤销";
        }
        if ("reject".equals(action)) {
            return "已驳回";
        }
        return "DONE".equals(status)
                ? "审批已全部通过，单据完结"
                : "已通过「" + stepName + "」，等待下一环节审批";
    }

    private void requireInitiator(Map<String, Object> doc, Map<String, Object> flow) {
        String me = AuthContext.currentUserId();
        if (me == null || me.isEmpty()) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录，无法提交或撤销单据");
        }
        if (me.equals(text(doc.get("creatorId")))) {
            return;
        }
        String roleId = flow == null ? "" : text(flow.get("initiatorRoleId"));
        if (!roleId.isEmpty() && genericService.userHasRole(me, roleId)) {
            return;
        }
        throw new ApiException(ErrorCode.FORBIDDEN, "只有单据创建人或流程发起人角色可以提交或撤销");
    }

    private void requireApprover(Map<String, Object> step, List<Map<String, Object>> approvals, String deptId) {
        String me = AuthContext.currentUserId();
        if (me == null || me.isEmpty()) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录，无法审批");
        }
        Set<String> approvers = ApprovalSupport.approverIdsOf(step, approvals, genericService, deptId);
        if (approvers.contains(me)) {
            return;
        }
        throw new ApiException(ErrorCode.FORBIDDEN, approvalHint(step, approvers));
    }

    /**
     * 403 文案：能点名到具体的人就点名（部门负责人/分管领导），
     * 否则回退到角色名（财务、仓管等归口角色）。
     */
    private String approvalHint(Map<String, Object> step, Set<String> approvers) {
        String stepName = text(step.get("name"));
        if (ApproverResolver.isPersonScoped(step)) {
            StringJoiner names = new StringJoiner("、");
            for (String id : approvers) {
                String name = ApproverResolver.userNameOf(genericService, id);
                if (!name.isEmpty()) {
                    names.add(name);
                }
            }
            String who = names.length() == 0
                    ? ApproverResolver.personLabel(step.get("approverType"))
                    : names.toString();
            return "当前环节「" + stepName + "」需要由「" + who + "」审批";
        }
        return "当前环节「" + stepName + "」需要由「"
                + trailWriter.roleNameOf(text(step.get("approverRoleId"))) + "」审批";
    }

    /**
     * 审批协作动作：加签 / 转办 / 抄送。
     *
     * <p>三者都只落一条轨迹、不推进单据状态：
     * 加签把目标人追加进当前环节的审批人集合；转办用目标人替换当前环节审批人；
     * 抄送只留痕（不参与 ANY / ALL 判定），单据创建人也可发起。</p>
     */
    private Map<String, Object> collaborate(ApprovalRequest request, String docKey, String docId, String action,
                                            String comment, Map<String, Object> previous, String oldStatus,
                                            Map<String, Object> flow, Map<String, Object> current,
                                            String bizType, List<Map<String, Object>> approvals, String deptId) {
        String me = AuthContext.currentUserId();
        if (me == null || me.isEmpty()) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录，无法执行审批协作动作");
        }
        String target = text(request.getTargetUserId());
        if (target.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "请选择目标人员");
        }
        if (target.equals(me)) {
            throw new ApiException(ErrorCode.VALIDATION, "目标人员不能是自己");
        }
        Map<String, Object> targetUser = genericService.get("org-users", target);
        if (targetUser == null) {
            throw new ApiException(ErrorCode.VALIDATION, "目标人员不存在");
        }
        if (!"ENABLED".equals(text(targetUser.get("status")))) {
            throw new ApiException(ErrorCode.VALIDATION, "目标人员已停用，不能接收审批任务");
        }
        boolean cc = "cc".equals(action);
        if (!"PROCESSING".equals(oldStatus)) {
            throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以加签、转办或抄送");
        }
        if (current == null && !cc) {
            throw new ApiException(ErrorCode.CONFLICT, "该单据已无待审环节，不能加签或转办");
        }
        boolean isApprover = current != null
                && ApprovalSupport.approverIdsOf(current, approvals, genericService, deptId).contains(me);
        if (!isApprover && !(cc && me.equals(text(previous.get("creatorId"))))) {
            throw new ApiException(ErrorCode.FORBIDDEN,
                    "只有当前环节的审批人可以执行该动作（抄送还允许单据创建人）");
        }
        if (!cc && ApprovalSupport.approverIdsOf(current, approvals, genericService, deptId).contains(target)) {
            throw new ApiException(ErrorCode.CONFLICT, "该人员已是当前环节的审批人");
        }
        String result = "addSign".equals(action) ? "ADD_SIGN"
                : "transfer".equals(action) ? "TRANSFER" : "CC";
        String targetName = text(targetUser.get("name"));
        String message = "addSign".equals(action) ? "已加签给「" + targetName + "」"
                : "transfer".equals(action) ? "已转办给「" + targetName + "」"
                : "已抄送给「" + targetName + "」";
        Map<String, Object> trail = trailWriter.write(docKey, docId, ApprovalSupport.docCodeOf(previous), bizType,
                flow, current, result, comment, target);
        return result(oldStatus, message, trail);
    }

    private static boolean isLastStep(List<Map<String, Object>> steps, Map<String, Object> current) {
        if (steps.isEmpty()) {
            return true;
        }
        String lastKey = text(steps.get(steps.size() - 1).get("key"));
        return lastKey.equals(text(current.get("key")));
    }

    /**
     * 固资单据完结后联动资产台账（P1-D2）。
     *
     * <p>派发：使用人取单据创建人（alloc 契约暂无独立使用人字段），资产置为使用中；
     * 退库：清空使用人并回到空闲；借出：置为借出中。
     * 其余单据（入库/调拨/维修/变更/处置）只留痕，不动台账字段。</p>
     */
    private void syncAssetLedger(String bizType, Map<String, Object> doc) {
        String assetId = text(doc.get("assetId"));
        if (assetId.isEmpty()) {
            return;
        }
        switch (bizType) {
            case "DISPATCH":
                genericService.patchField(ASSETS, assetId, "userId", text(doc.get("creatorId")), null);
                genericService.patchField(ASSETS, assetId, "status", "IN_USE", null);
                break;
            case "RETURN":
                genericService.patchField(ASSETS, assetId, "userId", null, null);
                genericService.patchField(ASSETS, assetId, "status", "IDLE", null);
                break;
            case "BORROW":
                genericService.patchField(ASSETS, assetId, "status", "BORROWED", null);
                break;
            default:
                break;
        }
    }

    private static String text(Object value) {
        return ApprovalSupport.text(value);
    }
}
