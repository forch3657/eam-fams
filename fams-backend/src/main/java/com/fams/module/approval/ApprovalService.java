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
        Map<String, Object> current = ApprovalSupport.currentStep(
                steps, ApprovalSupport.approvalsOf(genericService, APPROVALS, docKey, docId), genericService);

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
            requireApprover(current);
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
                requireApprover(current);
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
        next.put("finishTime", "PROCESSING".equals(nextStatus) ? null : LocalDateTime.now());
        genericService.updateQuietly(collection, docId, next);

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

    private void requireApprover(Map<String, Object> step) {
        String me = AuthContext.currentUserId();
        if (me == null || me.isEmpty()) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录，无法审批");
        }
        String roleId = text(step.get("approverRoleId"));
        boolean byRole = !roleId.isEmpty() && genericService.userHasRole(me, roleId);
        if (byRole || me.equals(text(step.get("approverId")))) {
            return;
        }
        throw new ApiException(ErrorCode.FORBIDDEN, "当前环节「" + text(step.get("name"))
                + "」需要由「" + trailWriter.roleNameOf(roleId) + "」审批");
    }

    private static boolean isLastStep(List<Map<String, Object>> steps, Map<String, Object> current) {
        if (steps.isEmpty()) {
            return true;
        }
        String lastKey = text(steps.get(steps.size() - 1).get("key"));
        return lastKey.equals(text(current.get("key")));
    }

    private static String text(Object value) {
        return ApprovalSupport.text(value);
    }
}
