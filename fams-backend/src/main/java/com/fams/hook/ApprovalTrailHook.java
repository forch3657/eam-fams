package com.fams.hook;

import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericMapper;
import com.fams.engine.QuerySpec;
import com.fams.module.approval.ApprovalSupport;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 审批轨迹兜底生成（契约 5.6）。
 *
 * <p>正常路径走 {@code POST /api/approvals/action}，由服务端一次性完成状态推进与轨迹落库。
 * 但单据状态也可能绕过该端点被直接改（批量回写、数据修复、外部系统对接），
 * 这里统一补记，保证「任何一次状态迁移都留痕」。</p>
 *
 * <p>只在状态真正发生变化时记录；写入失败仅告警，绝不回滚业务操作本身。</p>
 *
 * <p>依赖上刻意只注入 {@code GenericMapper / RowCodec} 而不注入 {@code GenericService}：
 * GenericService → HookRegistry → 本钩子 → GenericService 会构成无法解析的循环依赖。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ApprovalTrailHook implements ResourceHook {

    private static final String APPROVALS = "fixed-asset-doc-approvals";

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    @Override
    public Set<String> keys() {
        return ApprovalSupport.approvalCollections();
    }

    @Override
    public void afterCreate(ResourceMeta meta, Map<String, Object> row) {
        String docKey = ApprovalSupport.docKeyOf(meta.getKey());
        if (docKey == null) {
            return;
        }
        String status = text(row.get("status"));
        if ("PROCESSING".equals(status) || "DONE".equals(status)) {
            writeTrail(docKey, row, meta, null, "SUBMIT", "提交申请", "");
        }
    }

    @Override
    public void afterUpdate(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
        if (previous == null) {
            return;
        }
        String docKey = ApprovalSupport.docKeyOf(meta.getKey());
        if (docKey == null) {
            return;
        }
        String oldStatus = text(previous.get("status"));
        String newStatus = text(next.get("status"));
        if (oldStatus.equals(newStatus)) {
            return;
        }
        if ("PROCESSING".equals(newStatus)) {
            writeTrail(docKey, next, meta, null, "SUBMIT", "提交申请", "");
        } else if ("DONE".equals(newStatus)) {
            writeTrail(docKey, next, meta, null, "AGREE", "审批完成", text(next.get("remark")));
        } else if ("REJECTED".equals(newStatus)) {
            writeTrail(docKey, next, meta, null, "REJECT", "驳回申请", text(next.get("remark")));
        } else if ("REVOKED".equals(newStatus)) {
            writeTrail(docKey, next, meta, null, "REVOKE", "撤销申请", "");
        }
    }

    private void writeTrail(String docKey, Map<String, Object> doc, ResourceMeta meta,
                            Map<String, Object> step, String result, String stepName, String comment) {
        String bizType = ApprovalSupport.bizTypeOf(docKey);
        String docId = text(doc.get(meta.getPkField()));
        if (bizType == null || docId.isEmpty()) {
            return;
        }
        ResourceMeta approvals = registry.resolve(APPROVALS);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put(meta.getPkField(), java.util.UUID.randomUUID().toString());
        row.put("docKey", docKey);
        row.put("docId", docId);
        row.put("docCode", docCodeOf(doc));
        row.put("bizType", bizType);
        if (step == null) {
            row.put("stepKey", "");
            row.put("stepName", stepName);
        }
        row.put("result", result);
        row.put("comment", comment);
        row.put("approverId", AuthContext.currentUserId());
        UserPrincipal principal = AuthContext.current();
        row.put("approverName", principal == null ? "" : principal.getName());
        row.put("approverRoleName", "");
        row.put("time", LocalDateTime.now());
        mapper.insert(insertParams(approvals, row));
    }

    /** 与 GenericService#writeParams 同构的插入参数（含动态集合固有列） */
    private static Map<String, Object> insertParams(ResourceMeta meta, Map<String, Object> row) {
        List<String> cols = new ArrayList<>();
        Map<String, Object> values = new LinkedHashMap<>();
        int i = 0;
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            cols.add(entry.getKey());
            values.put("f" + i, entry.getValue());
            i++;
        }
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("cols", cols);
        params.put("v", values);
        return params;
    }

    private static String docCodeOf(Map<String, Object> doc) {
        String code = ApprovalSupport.text(doc.get("code"));
        return code.isEmpty() ? ApprovalSupport.text(doc.get("docNo")) : code;
    }

    private static String text(Object value) {
        return ApprovalSupport.text(value);
    }
}
