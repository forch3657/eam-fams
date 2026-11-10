package com.fams.module.approval;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.EnumCatalog;
import com.fams.engine.DateTimes;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    /** 借出单 / 退库单集合：归还型退库单通过 borrowDocId 关联借出单 */
    private static final String BORROW_DOCS = "fixed-asset-doc-lists-borrow";
    private static final String BACK_DOCS = "fixed-asset-doc-lists-back";

    /** 固定资产单据集合：状态前置校验与「同资产审批中互斥」的扫描范围 */
    private static final String[] FIXED_ASSET_DOC_COLLECTIONS = {
            "fixed-asset-doc-lists-inbound", "fixed-asset-doc-lists-alloc",
            BACK_DOCS, BORROW_DOCS,
            "fixed-asset-doc-lists-transfer", "fixed-asset-doc-lists-repair",
            "fixed-asset-doc-lists-change", "fixed-asset-doc-lists-dispose"
    };

    /** 处置单集合：盘点盘亏核销生成待审处置单 */
    private static final String DISPOSE_DOCS = "fixed-asset-doc-lists-dispose";

    /** 入库单集合：盘点盘盈建账生成待验收入库单（走 WF1 资产入库验收流程） */
    private static final String INBOUND_DOCS = "fixed-asset-doc-lists-inbound";

    /** 维修单 / 变更单集合：盘点异常按登记的处理去向生成待审单据 */
    private static final String REPAIR_DOCS = "fixed-asset-doc-lists-repair";

    private static final String CHANGE_DOCS = "fixed-asset-doc-lists-change";

    /** 盘点异常的处理去向（INVENTORY_DISPOSAL 枚举）：前两种生成单据，「已说明」只留痕 */
    private static final String DISPOSAL_REPAIR = "REPAIR";

    private static final String DISPOSAL_CHANGE = "CHANGE";

    private static final String DISPOSAL_EXPLAINED = "EXPLAINED";

    /** 资产状态：盘盈建账后待入库验收 */
    private static final String STATUS_PENDING_INBOUND = "PENDING_INBOUND";

    /** 资产状态：盘亏待核销（等处置审批） */
    private static final String STATUS_PENDING_WRITE_OFF = "PENDING_WRITE_OFF";

    /** 资产状态：已核销（处置审批完结） */
    private static final String STATUS_DISPOSED = "DISPOSED";

    /** 单条盘盈明细最多登记件数：逐件建台账 + 入库单，避免一条明细刷出海量资产 */
    private static final int MAX_SURPLUS_QTY = 99;

    /** 盘点单集合：完结删除限系统管理员；盘盈派生失败时失败说明也写回这里 */
    private static final String INVENTORY_DOCS = "fixed-asset-inventory-docs";

    /** 盘点计划集合：盘点单完结后回写来源计划的状态 */
    private static final String INVENTORY_PLANS = "fixed-asset-inventory-plans";

    /**
     * 来源盘点计划的单号标记。
     *
     * <p>盘点单契约里没有 planId 字段（加字段要改表结构），来源计划写在 remark 里：
     * 「由盘点计划 PD-2026-001 生成」。</p>
     */
    private static final Pattern PLAN_FROM_REMARK = Pattern.compile("盘点计划\\s*([A-Za-z0-9\\-]+)");

    private final GenericService genericService;

    private final ApprovalTrailWriter trailWriter;

    /** 枚举白名单（由前端 enums.js 导出）：盘盈送审前校验资产分类是否是可落库的枚举码 */
    private final EnumCatalog enumCatalog;

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
        // 归还已并入退库单（WF3）走正式审批：不再有免审批的 action=return 登记
        if ("return".equals(action)) {
            throw new ApiException(ErrorCode.BAD_REQUEST,
                    "归还登记已停用，请发起关联原借出单的退库单，经仓管验收后完结");
        }
        String bizType = text(request.getBizType()).isEmpty()
                ? ApprovalSupport.bizTypeOf(docKey)
                : text(request.getBizType());
        Map<String, Object> flow = ApprovalSupport.flowOf(genericService, FLOWS, bizType);
        // 环节生效条件以服务端判定为准：客户端可以伪造 ctx 把条件环节跳过
        Map<String, Object> ctx = effectiveCtx(bizType, previous, request.getCtx());
        List<Map<String, Object>> steps = ApprovalSupport.effectiveSteps(flow, ctx);
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
            if ("INVENTORY".equals(bizType)) {
                // 盘点单必须盘完才能送审，否则会出现「空盘点单被审批通过」
                long pending = pendingCheckCount(previous);
                if (pending > 0) {
                    throw new ApiException(ErrorCode.BAD_REQUEST,
                            "还有 " + pending + " 项资产未登记盘点结果，请先在「盘点清单」完成盘点");
                }
                // 异常明细必须有明确去向，否则盘点完结时无单据可派、结论悬空
                long unresolved = unresolvedAbnormalCount(previous);
                if (unresolved > 0) {
                    throw new ApiException(ErrorCode.BAD_REQUEST,
                            "还有 " + unresolved + " 项异常资产未选择处理去向，请在「盘点清单」登记（转维修单 / 转变更单 / 已说明）");
                }
                // 盘盈明细是完结时的建账依据。建账走独立事务、失败只记日志、不回滚审批结论，
                // 若等完结才发现要素不全，就成了「已完结却没入账」的无痕盘盈。
                // 因此按用户裁决在送审这一环一次性点名拦下，完结阶段仍不阻断。
                List<String> surplusErrors = validateInventorySurplusForSubmit(previous);
                if (!surplusErrors.isEmpty()) {
                    int shown = Math.min(surplusErrors.size(), 5);
                    String detail = String.join("；", surplusErrors.subList(0, shown));
                    if (surplusErrors.size() > shown) {
                        detail += "；另有 " + (surplusErrors.size() - shown) + " 项待补齐";
                    }
                    throw new ApiException(ErrorCode.BAD_REQUEST,
                            "盘盈明细不符合建账要求，请到「盘点清单」补齐后重新提交：" + detail);
                }
            }
            // 固定资产单据：必须挂具体资产、状态前置合法、同资产不得并发审批，
            // 归还型退库单还要校验关联的借出单（防止重复归还或无单归还）
            // 先校验归还单关联（错误信息更精确），再做资产状态与互斥校验
            validateBorrowReturnLink(docKey, docId, previous);
            validateAssetPrecondition(collection, bizType, docId, previous);
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
        } else if ("withdraw".equals(action)) {
            // 发起人撤回：审批中 → 草稿，单据编号保留，可再次提交
            if (!"PROCESSING".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以撤回");
            }
            requireInitiator(previous, flow);
            if (comment.isEmpty()) {
                throw new ApiException(ErrorCode.VALIDATION, "撤回必须填写意见");
            }
            result = "WITHDRAW";
            step = null;
            stepName = "撤回申请";
            nextStatus = "DRAFT";
        } else if ("void".equals(action)) {
            // 发起人作废：终态 REVOKED，编号与轨迹保留，不可再提交
            if (!"DRAFT".equals(oldStatus) && !"PROCESSING".equals(oldStatus)
                    && !"REJECTED".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有待提交、审批中或已驳回的单据可以作废");
            }
            requireInitiator(previous, flow);
            if (!"DRAFT".equals(oldStatus) && comment.isEmpty()) {
                throw new ApiException(ErrorCode.VALIDATION, "作废必须填写意见");
            }
            result = "VOID";
            step = null;
            stepName = "作废单据";
            nextStatus = "REVOKED";
        } else if ("revoke".equals(action)) {
            // 兼容旧入口：前端已改为「撤回 / 作废」，保留以免历史调用与回归用例失效
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
        } else if ("terminate".equals(action)) {
            // 审批人终止：只限当前环节审批人，必填意见并留下带环节名的轨迹
            if (!"PROCESSING".equals(oldStatus)) {
                throw new ApiException(ErrorCode.CONFLICT, "只有审批中的单据可以终止");
            }
            if (current == null) {
                throw new ApiException(ErrorCode.CONFLICT, "该单据已无待审环节，不能终止");
            }
            requireApprover(current, approvals, deptId);
            if (comment.isEmpty()) {
                throw new ApiException(ErrorCode.VALIDATION, "终止必须填写意见");
            }
            result = "TERMINATE";
            step = current;
            stepName = text(current.get("name"));
            nextStatus = "REVOKED";
        } else {
            throw new ApiException(ErrorCode.BAD_REQUEST, "不支持的审批动作：" + action);
        }

        Map<String, Object> next = new LinkedHashMap<>(previous);
        next.put("status", nextStatus);
        // 撤回后回到草稿，不能留下完结时间；只有终态才写
        LocalDateTime finishedAt = ("PROCESSING".equals(nextStatus) || "DRAFT".equals(nextStatus))
                ? null : LocalDateTime.now();
        next.put("finishTime", finishedAt);
        // 低值单据契约用 settleTime（表中无 finishTime 列），审批完结时同步写入
        if (collection.startsWith("low-value-")) {
            next.put("settleTime", finishedAt);
        }
        genericService.updateQuietly(collection, docId, next);

        // 维修单：提交送修即进入「维修中」；完结由 syncAssetLedger 在修毕验收后回「使用中」；
        // 撤回 / 驳回 / 作废 / 终止等回退动作要恢复，否则资产会被锁死在 REPAIRING
        if ("REPAIR".equals(bizType) && collection.startsWith("fixed-asset-doc-lists-")) {
            String repairAssetId = text(previous.get("assetId"));
            if (!repairAssetId.isEmpty()) {
                if ("submit".equals(action)) {
                    genericService.patchField(ASSETS, repairAssetId, "status", "REPAIRING", null);
                } else if (!"DONE".equals(nextStatus) && !"PROCESSING".equals(nextStatus)
                        && "REPAIRING".equals(assetStatus(repairAssetId))) {
                    genericService.patchField(ASSETS, repairAssetId, "status", "IN_USE", null);
                }
            }
        }

        // 固资单据完结后联动台账（派发/退库/借出/入库/处置/变更）
        if ("DONE".equals(nextStatus)) {
            syncAssetLedger(bizType, previous);
            if ("INVENTORY".equals(bizType)) {
                // 盘点结论落地：盘亏明细生成处置单草案，等管理员走处置审批
                syncInventoryLoss(previous);
                // 盘点异常：按明细登记的去向生成待审维修单 / 变更单
                syncInventoryAbnormal(previous);
                // 盘盈（账外资产）：建账并生成入库单，等仓管/资产管理员验收入库
                syncInventorySurplus(previous);
                // 来源盘点计划随之完结（计划本身没有审批流，状态只能跟着盘点单走）
                syncInventoryPlan(previous);
            }
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
        if ("withdraw".equals(action)) {
            return "已撤回，单据回到待提交，可再次提交";
        }
        if ("void".equals(action)) {
            return "单据已作废";
        }
        if ("terminate".equals(action)) {
            return "审批已终止，单据作废";
        }
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
     * <p>派发：资产置为使用中；退库：清空使用人并回到空闲（归还型退库单同时回写借出单）；
     * 借出：置为借出中；入库：待入库 → 空闲；处置：待核销 → 已核销；
     * 调拨：更新归属字段、状态不变；维修：修毕验收后 维修中 → 使用中；
     * 信息更正：前后快照随单据落库，台账状态与归属不变。</p>
     */
    private void syncAssetLedger(String bizType, Map<String, Object> doc) {
        String assetId = text(doc.get("assetId"));
        if (assetId.isEmpty()) {
            return;
        }
        switch (bizType) {
            case "DISPATCH":
                // 实际领用人字段来源仍待产品裁决（§7.3）：有 receiverId 时优先，否则沿用创建人
                String receiver = text(doc.get("receiverId"));
                if (receiver.isEmpty()) {
                    receiver = text(doc.get("userId"));
                }
                if (receiver.isEmpty()) {
                    receiver = text(doc.get("creatorId"));
                }
                genericService.patchField(ASSETS, assetId, "userId", receiver, null);
                patchIfPresent(doc, assetId, "deptId");
                genericService.patchField(ASSETS, assetId, "status", "IN_USE", null);
                break;
            case "RETURN":
                genericService.patchField(ASSETS, assetId, "userId", null, null);
                genericService.patchField(ASSETS, assetId, "status", "IDLE", null);
                markBorrowReturned(doc);
                break;
            case "BORROW":
                genericService.patchField(ASSETS, assetId, "status", "BORROWED", null);
                break;
            case "INBOUND":
                // 入库验收通过：待入库的账外资产正式转空闲可用，并补入库日期
                String current = assetStatus(assetId);
                if (STATUS_PENDING_INBOUND.equals(current)) {
                    genericService.patchField(ASSETS, assetId, "status", "IDLE", null);
                    genericService.patchField(ASSETS, assetId, "inboundDate", DateTimes.format(LocalDateTime.now()), null);
                    log.info("入库验收通过，账外资产转空闲 assetId={}", assetId);
                }
                break;
            case "DISPOSE":
                // 处置核销通过：待核销的资产账面上注销（保留在台账里留痕）
                if (STATUS_PENDING_WRITE_OFF.equals(assetStatus(assetId))) {
                    genericService.patchField(ASSETS, assetId, "status", STATUS_DISPOSED, null);
                }
                break;
            case "TRANSFER":
                // 调拨属于「在册继续使用」：只更新归属字段，不改资产状态
                patchIfPresent(doc, assetId, "deptId");
                patchIfPresent(doc, assetId, "userId");
                patchIfPresent(doc, assetId, "location");
                log.info("资产调拨完结 assetId={}", assetId);
                break;
            case "REPAIR":
                // 修毕验收完结：维修中 → 使用中
                if ("REPAIRING".equals(assetStatus(assetId))) {
                    genericService.patchField(ASSETS, assetId, "status", "IN_USE", null);
                    log.info("维修验收完成，资产恢复使用中 assetId={}", assetId);
                }
                break;
            case "CHANGE":
                // 信息更正的前后快照已随单据落库，台账状态 / 使用人不变
                log.info("资产变更单完结 assetId={} changeType={}", assetId, text(doc.get("changeType")));
                break;
            default:
                break;
        }
    }

    /** 单据上有该字段时才回写台账，兼容仍走动态模板、尚无该字段的单据集合 */
    private void patchIfPresent(Map<String, Object> doc, String assetId, String field) {
        Object value = doc.get(field);
        if (value != null && !text(value).isEmpty()) {
            genericService.patchField(ASSETS, assetId, field, value, null);
        }
    }

    /** 归还型退库单完结：把关联借出单标记为已归还，保留历史列的语义 */
    private void markBorrowReturned(Map<String, Object> returnDoc) {
        String borrowDocId = text(returnDoc.get("borrowDocId"));
        if (borrowDocId.isEmpty()) {
            return;
        }
        Map<String, Object> patch = new LinkedHashMap<>(genericService.get(BORROW_DOCS, borrowDocId));
        patch.put("returned", true);
        patch.put("returnDate", DateTimes.format(LocalDateTime.now()));
        patch.put("returnBy", AuthContext.currentUserId());
        genericService.updateQuietly(BORROW_DOCS, borrowDocId, patch);
        log.info("借出归还退库单完结，借出单已标记归还 borrowDocId={}", borrowDocId);
    }

    /** 读资产当前状态（台账回写前先确认状态，避免覆盖别的流程改过的状态） */
    private String assetStatus(String assetId) {
        try {
            Map<String, Object> row = genericService.get(ASSETS, assetId);
            return text(row.get("status"));
        } catch (RuntimeException e) {
            log.warn("读取资产状态失败 assetId={}", assetId, e);
            return "";
        }
    }

    /**
     * 固定资产单据提交前置校验：assetId 必填、状态符合业务前置、同资产不得并发审批。
     *
     * <p>盘点单 / 低值单据没有 assetId，不走本校验。互斥扫描用 listInternal，
     * 避免当前登录人的数据范围过滤让「别人正在审批的单据」漏检。</p>
     */
    private void validateAssetPrecondition(String collection, String bizType, String selfId,
                                           Map<String, Object> doc) {
        if (!collection.startsWith("fixed-asset-doc-lists-")) {
            return;
        }
        String assetId = text(doc.get("assetId"));
        if (assetId.isEmpty()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "固定资产单据必须关联具体资产");
        }
        String status = assetStatus(assetId);
        if (status.isEmpty()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "关联资产不存在或状态不可读");
        }
        switch (bizType) {
            case "DISPATCH":
                requireStatus(status, "资产不在空闲状态，不能派发", "IDLE");
                break;
            case "BORROW":
                requireStatus(status, "只有使用中的资产可以借出", "IN_USE");
                break;
            case "RETURN":
                requireStatus(status, "只有使用中或借出中的资产可以退库", "IN_USE", "BORROWED");
                break;
            case "REPAIR":
                requireStatus(status, "只有使用中或借出中的资产可以送修", "IN_USE", "BORROWED");
                break;
            case "TRANSFER":
            case "CHANGE":
            case "DISPOSE":
                requireStatus(status, "资产处于不可用状态，不能发起该业务",
                        "IDLE", "IN_USE", "PENDING_WRITE_OFF");
                break;
            case "INBOUND":
                requireStatus(status, "只有待入库资产可以办理入库验收", "PENDING_INBOUND");
                break;
            default:
                break;
        }
        // 互斥：同一资产同一时刻只允许一张 PROCESSING 单据
        Map<String, String[]> raw = new LinkedHashMap<>();
        raw.put("status", new String[]{"PROCESSING"});
        for (String key : FIXED_ASSET_DOC_COLLECTIONS) {
            for (Map<String, Object> row : genericService.listInternal(key, raw)) {
                if (!"PROCESSING".equals(text(row.get("status")))
                        || !assetId.equals(text(row.get("assetId")))
                        || selfId.equals(text(row.get("id")))) {
                    continue;
                }
                throw new ApiException(ErrorCode.CONFLICT,
                        "该资产已有审批中的单据，请等待完结后再发起新业务");
            }
        }
    }

    private static void requireStatus(String actual, String message, String... allowed) {
        for (String s : allowed) {
            if (s.equals(actual)) {
                return;
            }
        }
        throw new ApiException(ErrorCode.CONFLICT, message + "（当前状态：" + actual + "）");
    }

    /** 归还型退库单：校验关联借出单合法且未归还，并防止重复归还 */
    private void validateBorrowReturnLink(String docKey, String selfId, Map<String, Object> doc) {
        if (!"back".equals(docKey)) {
            return;
        }
        String borrowDocId = text(doc.get("borrowDocId"));
        if (borrowDocId.isEmpty()) {
            return;
        }
        Map<String, Object> borrow;
        try {
            borrow = genericService.get(BORROW_DOCS, borrowDocId);
        } catch (RuntimeException e) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "关联的借出单不存在：" + borrowDocId);
        }
        if (!"DONE".equals(text(borrow.get("status")))) {
            throw new ApiException(ErrorCode.CONFLICT, "只有审批通过的借出单可以发起归还退库");
        }
        if (isTruthy(borrow.get("returned"))) {
            throw new ApiException(ErrorCode.CONFLICT, "该借出单已归还，不能重复归还");
        }
        if (!text(doc.get("assetId")).equals(text(borrow.get("assetId")))) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "归还退库单与借出单指向的资产不一致");
        }
        Map<String, String[]> raw = new LinkedHashMap<>();
        raw.put("borrowDocId", new String[]{borrowDocId});
        for (Map<String, Object> row : genericService.listInternal(BACK_DOCS, raw)) {
            if (selfId.equals(text(row.get("id")))
                    || !borrowDocId.equals(text(row.get("borrowDocId")))) {
                continue;
            }
            String st = text(row.get("status"));
            if (!"REVOKED".equals(st) && !"REJECTED".equals(st)) {
                throw new ApiException(ErrorCode.CONFLICT,
                        "该借出单已有归还中的退库单，不能重复归还");
            }
        }
    }

    /** MySQL TINYINT(1) 可能读成 Boolean / Integer / 字符串 */
    private static boolean isTruthy(Object value) {
        String s = String.valueOf(value);
        return Boolean.TRUE.equals(value) || "1".equals(s) || "true".equalsIgnoreCase(s);
    }

    /**
     * 环节生效条件上下文：一律由服务端按单据事实覆盖客户端传值。
     *
     * <p>盘点差异（{@code hasDiff}）按明细重算，防止把 false 传上来跳过差异复核；
     * 处置方式（{@code disposeType}）与金额以单据字段为准，防止把变卖谎报成报废、
     * 或压低金额跳过「财务复核 / 审计备案」这两个强制环节。
     * 客户端 ctx 作为兜底：单据没有对应字段时仍沿用既有金额门槛口径。</p>
     */
    private static Map<String, Object> effectiveCtx(String bizType, Map<String, Object> doc, Map<String, Object> clientCtx) {
        Map<String, Object> ctx = new LinkedHashMap<>();
        if (clientCtx != null) {
            ctx.putAll(clientCtx);
        }
        if ("INVENTORY".equals(bizType)) {
            ctx.put("hasDiff", hasInventoryDiff(doc));
            return ctx;
        }
        if ("DISPOSE".equals(bizType)) {
            ctx.put("disposeType", text(doc.get("disposeType")));
            Object disposalAmount = doc.get("disposalAmount");
            if (disposalAmount != null && !text(disposalAmount).isEmpty()) {
                ctx.put("amount", disposalAmount);
            }
        }
        Object docAmount = doc.get("amount");
        if (docAmount != null && !text(docAmount).isEmpty()) {
            ctx.put("amount", docAmount);
        }
        return ctx;
    }

    /**
     * 盘点单是否存在差异：任一明细登记为盘盈 / 盘亏 / 异常即算有差异。
     */
    private static boolean hasInventoryDiff(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return false;
        }
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            String result = resultOf((Map<?, ?>) itemObj);
            if ("SURPLUS".equals(result) || "LOSS".equals(result) || "ABNORMAL".equals(result)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 明细的盘点结果：{@code result} 为准，为空或未盘时回退 {@code itemStatus}。
     *
     * <p>两个字段语义重叠（一个是结果、一个是由结果派生的明细状态），
     * 判定口径必须统一，否则会出现「有差异但没生成处置单」这类前后不一致。</p>
     */
    private static String resultOf(Map<?, ?> item) {
        String result = text(item.get("result"));
        if (!result.isEmpty() && !"UNCHECKED".equals(result)) {
            return result;
        }
        String itemStatus = text(item.get("itemStatus"));
        return itemStatus.isEmpty() ? result : itemStatus;
    }

    /**
     * 盘点单里还没登记结果的明细数（result 为空或 UNCHECKED）。
     *
     * <p>明细里同时存 itemStatus（单据状态）与 result（盘点结果）两个语义字段，
     * 判定以 result 为准：盘点员在清单里登记的是结果，itemStatus 由结果派生。</p>
     */
    private static long pendingCheckCount(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return 0L;
        }
        long pending = 0L;
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            String result = resultOf((Map<?, ?>) itemObj);
            if (result.isEmpty() || "UNCHECKED".equals(result)) {
                pending++;
            }
        }
        return pending;
    }

    /**
     * 盘点异常里还没选处理去向的明细数。
     *
     * <p>异常不同于盘盈/盘亏：它没有唯一的落账动作，必须由盘点员先给出去向
     * （转维修 / 转变更 / 已说明），否则审批完结后这条差异无人跟进。
     * 判定以服务端读到的明细为准，不采信客户端传值。</p>
     */
    private static long unresolvedAbnormalCount(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return 0L;
        }
        long unresolved = 0L;
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            Map<?, ?> item = (Map<?, ?>) itemObj;
            if (!"ABNORMAL".equals(resultOf(item))) {
                continue;
            }
            String disposal = text(item.get("disposal"));
            if (!DISPOSAL_REPAIR.equals(disposal) && !DISPOSAL_CHANGE.equals(disposal)
                    && !DISPOSAL_EXPLAINED.equals(disposal)) {
                unresolved++;
            }
        }
        return unresolved;
    }

    /**
     * 盘盈送审前置预检：完结时按明细逐件建台账（PENDING_INBOUND）并生成入库单，
     * 建账走的是 ASSETS 契约校验（分类枚举码、部门/使用人引用、金额、位置）。
     *
     * <p>派生动作在独立事务里执行，失败只记日志、不会让审批回滚（避免终审 500），
     * 所以必须在送审前把不合格明细挡住；否则会出现「盘点单已完结、盘盈却没入账」
     * 且页面上没有任何痕迹。错误点名到明细项，盘点员可直接定位补齐。</p>
     *
     * @return 每条盘盈明细的缺项说明；为空表示可以送审
     */
    private List<String> validateInventorySurplusForSubmit(Map<String, Object> doc) {
        List<String> errors = new ArrayList<>();
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return errors;
        }
        // 引用字段必须是主数据 id：历史明细里存中文部门名，建账时会被引用校验直接拒绝
        Set<String> deptIds = refIds("org-departments");
        Set<String> userIds = refIds("org-users");
        int index = 0;
        for (Object itemObj : (List<?>) itemsObj) {
            index++;
            if (!(itemObj instanceof Map)) {
                continue;
            }
            Map<?, ?> item = (Map<?, ?>) itemObj;
            if (!"SURPLUS".equals(resultOf(item))) {
                continue;
            }
            String name = text(item.get("assetName")).trim();
            String label = "第 " + index + " 项" + (name.isEmpty() ? "" : "「" + cut(name, 20) + "」");
            List<String> missing = new ArrayList<>();
            if (name.isEmpty()) {
                missing.add("缺资产名称");
            }
            String category = text(item.get("assetType"));
            if (category.isEmpty() || !validAssetCategory(category)) {
                missing.add("资产分类须从下拉选择（不能填中文名称）");
            }
            if (cut(text(item.get("location")), 120).isEmpty()) {
                missing.add("缺存放位置");
            }
            if (surplusQty(item.get("qty")) < 0) {
                missing.add("数量须为 1~" + MAX_SURPLUS_QTY + " 的整数");
            }
            if (surplusPrice(item.get("price")) == null) {
                missing.add("购置金额须为不小于 0 的数字");
            }
            String dept = text(item.get("dept"));
            if (!dept.isEmpty() && deptIds != null && !deptIds.contains(dept)) {
                missing.add("使用部门不是有效的部门，请从下拉重新选择");
            }
            String userId = text(item.get("userId"));
            if (!userId.isEmpty() && userIds != null && !userIds.contains(userId)) {
                missing.add("使用人不是有效账号，请从下拉重新选择");
            }
            if (!missing.isEmpty()) {
                errors.add(label + "：" + String.join("、", missing));
            }
        }
        return errors;
    }

    /** 分类必须是 ASSET_CATEGORY 白名单里的枚举码，与台账建卡时的枚举校验同源 */
    private boolean validAssetCategory(String code) {
        if (enumCatalog == null) {
            // 降级场景没有注入枚举目录时退回格式校验，仍不放行中文标签
            return code.matches("[A-Z_]+");
        }
        Set<String> allowed = enumCatalog.allowed("ASSET_CATEGORY");
        return !allowed.isEmpty() && allowed.contains(code);
    }

    /** 引用主数据的 id 集合；读取失败返回 null 表示跳过该项校验，避免误挡正常送审 */
    private Set<String> refIds(String collection) {
        try {
            Set<String> ids = new HashSet<>();
            for (Map<String, Object> row : genericService.listInternal(collection, new LinkedHashMap<>())) {
                ids.add(text(row.get("id")));
            }
            return ids;
        } catch (RuntimeException e) {
            log.warn("盘盈送审预检读取 {} 失败，跳过引用校验", collection, e);
            return null;
        }
    }

    /**
     * 盘点异常结论落地：按登记去向生成待审维修单 / 变更单。
     *
     * <p>复用已有 repair / change 集合与 WF6 / WF7，不新增集合与资产状态。
     * 「已说明」只留在盘点明细里，不生成单据。派生单据走独立事务，
     * 生成失败只记 warn，不推翻盘点审批结论。</p>
     */
    private void syncInventoryAbnormal(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return;
        }
        String companyId = text(doc.get("companyId"));
        String creatorId = text(doc.get("creatorId"));
        String docNo = text(doc.get("docNo"));
        // 单号精确到毫秒并带随机盐：同一秒内完结多张盘点单也不撞唯一键
        String stamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());
        String salt = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 4);
        int seq = 0;
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            Map<?, ?> item = (Map<?, ?>) itemObj;
            if (!"ABNORMAL".equals(resultOf(item))) {
                continue;
            }
            String collection;
            String prefix;
            String actionName;
            String disposal = text(item.get("disposal"));
            if (DISPOSAL_REPAIR.equals(disposal)) {
                collection = REPAIR_DOCS;
                prefix = "WX";
                actionName = "转维修";
            } else if (DISPOSAL_CHANGE.equals(disposal)) {
                collection = CHANGE_DOCS;
                prefix = "BG";
                actionName = "转变更";
            } else {
                // EXPLAINED 只留痕；非法/空值已由送审前置拦下，这里防御性跳过
                continue;
            }
            String assetId = text(item.get("assetId"));
            if (assetId.isEmpty()) {
                log.warn("盘点异常明细缺少资产主键，跳过生成单据 doc={} disposal={}", docNo, disposal);
                continue;
            }
            seq++;
            String code = prefix + stamp + String.format("%02d", seq) + salt;
            Map<String, Object> derived = new LinkedHashMap<>();
            derived.put("code", code);
            derived.put("name", cut(text(item.get("assetName")), 200) + " 盘点异常" + actionName);
            derived.put("companyId", companyId);
            derived.put("assetId", assetId);
            derived.put("creatorId", creatorId);
            derived.put("createTime", LocalDateTime.now());
            derived.put("finishTime", null);
            derived.put("remark", cut("盘点异常" + actionName + "：盘点单 " + docNo
                    + "；" + text(item.get("remark")), 250));
            derived.put("status", "DRAFT");
            try {
                genericService.createIndependent(collection, derived);
            } catch (RuntimeException e) {
                log.warn("盘点异常生成单据失败 assetId={} code={}", assetId, code, e);
            }
        }
    }

    /**
     * 盘点结论落地：盘亏明细生成处置单草案。
     *
     * <p>盘亏意味着账上有、现场没有，需要走资产处置核销；这里只生成待审草案，
     * 由管理员在「资产处置」里继续走处置审批链。盘盈（账外资产）不在这里处理，
     * 它要先补录入库单建账，才能成为正式资产。</p>
     */
    private void syncInventoryLoss(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return;
        }
        String companyId = text(doc.get("companyId"));
        String creatorId = text(doc.get("creatorId"));
        // 单号精确到毫秒并带随机后缀：同一秒内完结两张盘点单也不会撞唯一键
        // （撞键会抛 ApiException，把主事务标记成 rollback-only，整个审批动作直接 500）
        String stamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());
        String salt = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 4);
        int seq = 0;
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            Map<?, ?> item = (Map<?, ?>) itemObj;
            if (!"LOSS".equals(resultOf(item))) {
                continue;
            }
            String assetId = text(item.get("assetId"));
            if (assetId.isEmpty()) {
                // 没有资产主键的账外条目无法核销（账外资产只能盘盈，不能盘亏）
                continue;
            }
            seq++;
            Map<String, Object> dispose = new LinkedHashMap<>();
            dispose.put("code", "CZ" + stamp + String.format("%02d", seq) + salt);
            dispose.put("name", cut(text(item.get("assetName")), 240) + " 盘亏核销处置");
            dispose.put("companyId", companyId);
            dispose.put("assetId", assetId);
            dispose.put("creatorId", creatorId);
            dispose.put("createTime", LocalDateTime.now());
            dispose.put("finishTime", null);
            dispose.put("remark", cut("盘点盘亏核销：" + text(item.get("remark")), 250));
            dispose.put("status", "DRAFT");
            try {
                // 独立事务：处置单生成失败只回滚自己，不牵连审批状态推进
                genericService.createIndependent(DISPOSE_DOCS, dispose);
            } catch (RuntimeException e) {
                // 处置单生成失败不推翻盘点结论，只记录待人工处理
                log.warn("盘点盘亏生成处置单失败 assetId={} code={}", assetId, dispose.get("code"), e);
            }
            // 台账反映差异：盘亏资产置「待核销」，账实不符在台账上看得见，
            // 等处置审批通过再由 syncAssetLedger 转「已核销」
            try {
                genericService.patchField(ASSETS, assetId, "status", STATUS_PENDING_WRITE_OFF, null);
            } catch (RuntimeException e) {
                log.warn("盘点盘亏回写台账状态失败 assetId={}", assetId, e);
            }
        }
    }

    /**
     * 盘点盘盈（账外资产）建账：建台账 + 生成入库单。
     *
     * <p>盘盈意味着现场有、账上没有，按产品口径走「入库单审批流建账」：
     * 这里把账外资产建进台账（状态「待入库」），同时生成一张待验收入库单，
     * 走 WF1（仓管验收 → 资产管理员复核）；入库审批通过后资产转「空闲」正式可用。</p>
     *
     * <p>为什么先建台账再建入库单：入库单契约里只有 code/name/companyId/assetId/remark，
     * 装不下分类、部门、位置、金额这些建账要素；台账行才是这些信息的载体，
     * 入库单负责「验收」这一环。</p>
     */
    private void syncInventorySurplus(Map<String, Object> doc) {
        Object itemsObj = doc.get("items");
        if (!(itemsObj instanceof List)) {
            return;
        }
        String companyId = text(doc.get("companyId"));
        String creatorId = text(doc.get("creatorId"));
        String docNo = text(doc.get("docNo"));
        String stamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());
        String salt = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 4);
        int seq = 0;
        int failed = 0;
        String failureReason = "";
        for (Object itemObj : (List<?>) itemsObj) {
            if (!(itemObj instanceof Map)) {
                continue;
            }
            Map<?, ?> item = (Map<?, ?>) itemObj;
            if (!"SURPLUS".equals(resultOf(item))) {
                continue;
            }
            String assetName = cut(text(item.get("assetName")), 120);
            String location = cut(text(item.get("location")), 120);
            int qty = surplusQty(item.get("qty"));
            BigDecimal price = surplusPrice(item.get("price"));
            // 送审预检已挡住新数据；这里兜住绕过预检的历史单，避免「完结了却没有任何痕迹」
            if (assetName.isEmpty() || location.isEmpty() || qty < 0 || price == null) {
                failed += Math.max(1, qty);
                failureReason = "建账要素不完整（名称/分类/数量/金额/位置）";
                log.warn("盘点盘盈明细建账要素不完整，跳过建账 doc={} name={}", docNo, assetName);
                continue;
            }
            seq++;
            for (int i = 0; i < qty; i++) {
                // 单号带件序：同一明细登记多件时，每件一个资产、一个入库单
                String unit = String.format("%02d", seq) + String.format("%02d", i + 1);
                String assetCode = "GD" + stamp + unit + salt;
                Map<String, Object> asset = new LinkedHashMap<>();
                asset.put("code", assetCode);
                asset.put("name", assetName);
                asset.put("category", categoryOf(item));
                putIfPresent(asset, "companyId", companyId);
                putIfPresent(asset, "deptId", text(item.get("dept")));
                putIfPresent(asset, "userId", text(item.get("userId")));
                asset.put("location", location);
                asset.put("amount", price);
                asset.put("original", price);
                asset.put("net", price);
                asset.put("status", STATUS_PENDING_INBOUND);
                asset.put("depreciate", Boolean.TRUE);
                asset.put("purchaseMode", "PURCHASE");
                String assetId;
                try {
                    // 独立事务：建账失败只回滚自己，不牵连审批状态推进
                    Map<String, Object> created = genericService.createIndependent(ASSETS, asset);
                    assetId = text(created.get("id"));
                } catch (RuntimeException e) {
                    failed++;
                    failureReason = rootMessage(e);
                    log.warn("盘点盘盈建账失败 assetName={} code={}", assetName, assetCode, e);
                    continue;
                }
                if (assetId.isEmpty()) {
                    failed++;
                    failureReason = "建账未返回资产主键";
                    continue;
                }
                Map<String, Object> inbound = new LinkedHashMap<>();
                inbound.put("code", "RK" + stamp + unit + salt);
                inbound.put("name", cut(assetName, 200) + " 盘盈建账入库");
                inbound.put("companyId", companyId);
                inbound.put("assetId", assetId);
                inbound.put("creatorId", creatorId);
                inbound.put("createTime", LocalDateTime.now());
                inbound.put("finishTime", null);
                inbound.put("remark", cut("盘点盘盈建账：盘点单 " + docNo, 250));
                inbound.put("status", "DRAFT");
                try {
                    genericService.createIndependent(INBOUND_DOCS, inbound);
                } catch (RuntimeException e) {
                    // 入库单生成失败不推翻盘点结论：台账里已是「待入库」，管理员可手工补入库单
                    log.warn("盘点盘盈生成入库单失败 assetId={} code={}", assetId, inbound.get("code"), e);
                }
            }
        }
        if (failed > 0) {
            appendSurplusFailureRemark(doc, docNo, failed, failureReason);
        }
    }

    /**
     * 派生失败不回滚审批（用户裁决「完结不阻断」），但必须留痕：把失败件数与原因追加到
     * 盘点单备注，否则列表里只显示「已完成」，管理员根本看不出盘盈没入账。
     *
     * <p>备注列是 VARCHAR(255)，按剩余空间截断；始终保留原备注前缀，
     * 里面有「由盘点计划 xxx 生成」的关联标记，截断会破坏计划回写。</p>
     */
    private void appendSurplusFailureRemark(Map<String, Object> doc, String docNo, int failed, String reason) {
        String mark = "【盘盈建账失败 " + failed + " 件】" + cut(reason, 80)
                + "，请核对盘盈明细后手工补建台账与入库单";
        String base = cut(text(doc.get("remark")), 180);
        int room = 250 - base.length() - 1;
        String merged = base.isEmpty() ? cut(mark, 250) : base + " " + (room > 0 ? cut(mark, room) : "");
        try {
            // 已完结单据受状态守卫保护，不能走通用 update；patchField 只改备注一列且不递增 version
            genericService.patchField(INVENTORY_DOCS, text(doc.get("id")), "remark", merged);
        } catch (RuntimeException e) {
            log.warn("盘点盘盈失败备注写回失败 doc={}", docNo, e);
        }
    }

    /** 取异常链最内层的原因，避免备注里只落一句「服务异常」 */
    private static String rootMessage(RuntimeException e) {
        Throwable cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }

    /** 空值不写入：引用字段（公司/部门/用户）传空串会被引用校验判成「引用对象不存在」 */
    private static void putIfPresent(Map<String, Object> row, String field, String value) {
        if (value != null && !value.trim().isEmpty()) {
            row.put(field, value.trim());
        }
    }

    /**
     * 盘盈明细的资产分类：送审预检已保证是 ASSET_CATEGORY 枚举码；
     * 对历史中文标签仍退回 OTHER（「其他设备」），这类单据会在备注里留下失败痕迹。
     */
    private static String categoryOf(Map<?, ?> item) {
        String category = text(item.get("assetType"));
        if (!category.isEmpty() && category.matches("[A-Z_]+")) {
            return category;
        }
        return "OTHER";
    }

    /** 盘盈明细件数：非法、小于 1 或超过上限返回 -1，不再静默兜底成 1 */
    private static int surplusQty(Object value) {
        int qty;
        if (value instanceof Number) {
            qty = ((Number) value).intValue();
        } else {
            try {
                qty = Integer.parseInt(text(value));
            } catch (NumberFormatException e) {
                return -1;
            }
        }
        return qty >= 1 && qty <= MAX_SURPLUS_QTY ? qty : -1;
    }

    /** 盘盈明细金额：空值、非数字或负数返回 null；规整成 BigDecimal，避免空串写入数值列 */
    private static BigDecimal surplusPrice(Object value) {
        String raw = text(value);
        if (raw.isEmpty()) {
            return null;
        }
        try {
            BigDecimal price = new BigDecimal(raw);
            return price.signum() >= 0 ? price : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 按列宽截断：超长会触发数据库报错，把整个审批动作拖成 500 */
    private static String cut(String value, int max) {
        String v = value == null ? "" : value.trim();
        return v.length() <= max ? v : v.substring(0, max);
    }

    /**
     * 盘点单完结后把来源盘点计划置为「已完成」。
     *
     * <p>盘点计划没有自己的审批流，它的状态只能跟着盘点单走：生成盘点单时置 PROCESSING，
     * 盘点单完结后若没人回写，计划就永远停在「盘点中」，计划页的「进行中」计数也永远归不了零。</p>
     *
     * <p>来源计划从 remark 的「由盘点计划 {planNo} 生成」标记解析（盘点单契约里没有 planId
     * 字段，加字段要改表结构）。解析不到标记就跳过，不影响审批结论。</p>
     */
    private void syncInventoryPlan(Map<String, Object> doc) {
        String remark = text(doc.get("remark"));
        if (remark.isEmpty()) {
            return;
        }
        Matcher matcher = PLAN_FROM_REMARK.matcher(remark);
        if (!matcher.find()) {
            return;
        }
        String planNo = matcher.group(1);
        // 用 listInternal：这是系统侧的联动，不该受审批人自己的数据范围影响
        for (Map<String, Object> plan : genericService.listInternal(INVENTORY_PLANS, new LinkedHashMap<>())) {
            if (!planNo.equals(text(plan.get("planNo")))) {
                continue;
            }
            // 通用更新按整行校验（必填字段要一起带上），所以基于计划原行改状态
            Map<String, Object> patch = new LinkedHashMap<>(plan);
            patch.put("status", "DONE");
            genericService.updateQuietly(INVENTORY_PLANS, text(plan.get("id")), patch);
            log.info("盘点单完结，来源盘点计划置为已完成 planNo={}", planNo);
            return;
        }
    }

    private static String text(Object value) {
        return ApprovalSupport.text(value);
    }
}
