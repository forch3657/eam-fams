package com.fams.module.approval;

import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审批轨迹写入器：把一次审批动作落成 {@code fixed-asset-doc-approvals} 的一行。
 *
 * <p>step 为 {@code null} 表示「提交 / 撤销 / 终审」这类非环节动作。</p>
 *
 * <p>写入失败只告警不抛出：轨迹是审计留痕，不应该反过来阻断业务操作。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApprovalTrailWriter {

    public static final String APPROVALS = "fixed-asset-doc-approvals";

    public static final String ROLES = "org-roles";

    private final GenericService genericService;

    public Map<String, Object> write(String docKey, String docId, String docCode, String bizType,
                                     Map<String, Object> flow, Map<String, Object> step,
                                     String result, String comment) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("docKey", docKey);
        row.put("docId", docId);
        row.put("docCode", docCode);
        row.put("bizType", bizType);
        if (flow != null) {
            row.put("flowId", flow.get("id"));
            row.put("flowCode", flow.get("code"));
        }
        if (step != null) {
            row.put("stepKey", step.get("key"));
            row.put("stepName", step.get("name"));
            row.put("approverRoleName", roleNameOf(step.get("approverRoleId")));
        } else {
            row.put("stepKey", "");
            row.put("stepName", "");
            row.put("approverRoleName", "");
        }
        row.put("result", result);
        row.put("comment", comment);
        row.put("approverId", AuthContext.currentUserId());
        UserPrincipal principal = AuthContext.current();
        row.put("approverName", principal == null ? "" : principal.getName());
        row.put("time", LocalDateTime.now());
        try {
            return genericService.create(APPROVALS, row);
        } catch (RuntimeException ex) {
            log.warn("审批轨迹写入失败（{} / {}）：{}", docKey, docId, ex.getMessage());
            return row;
        }
    }

    public String roleNameOf(Object roleId) {
        String id = ApprovalSupport.text(roleId);
        if (id.isEmpty()) {
            return "";
        }
        for (Map<String, Object> role : genericService.list(ROLES, Collections.emptyMap())) {
            if (id.equals(ApprovalSupport.text(role.get("id")))) {
                return ApprovalSupport.text(role.get("name"));
            }
        }
        return id;
    }
}
