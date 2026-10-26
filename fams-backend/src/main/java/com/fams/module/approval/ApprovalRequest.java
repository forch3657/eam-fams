package com.fams.module.approval;

import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 审批动作请求（契约 5.6 审批轨迹）。
 *
 * <p>一次请求 = 单据在某个环节上的一次动作，服务端据此推进单据状态并落一条审批记录。</p>
 */
@Data
public class ApprovalRequest {

    /** 单据类型：inbound / alloc / back / borrow / transfer / repair / change / dispose / inventory / requisition / return */
    private String docKey;

    /** 单据主键 */
    private String docId;

    /** 审批业务类型（BUSINESS_TYPE）；为空时按 docKey 推导 */
    private String bizType;

    /** 动作：submit | approve | reject | revoke */
    private String action;

    /** 审批意见；驳回时必填 */
    private String comment;

    /** 触发条件上下文：{ amount, hasDiff } */
    private Map<String, Object> ctx;
}
