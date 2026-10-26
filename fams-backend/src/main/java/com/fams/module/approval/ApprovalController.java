package com.fams.module.approval;

import com.fams.common.R;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 审批动作端点（契约 5.6）。
 *
 * <p>与「固定资产 4.5.3 / 低值资产 4.5.6」的单据审批入口对应。
 * 一次请求完成状态推进 + 轨迹落库，避免前端两次写入导致轨迹缺失或重复。</p>
 */
@RestController
@RequestMapping("/api/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService approvalService;

    /** 执行审批动作：submit / approve / reject / revoke */
    @PostMapping("/action")
    public R<Map<String, Object>> action(@RequestBody(required = false) ApprovalRequest request) {
        if (AuthContext.current() == null) {
            throw new com.fams.common.ApiException(com.fams.common.ErrorCode.UNAUTHORIZED, "未登录");
        }
        return R.ok(approvalService.act(request));
    }
}
