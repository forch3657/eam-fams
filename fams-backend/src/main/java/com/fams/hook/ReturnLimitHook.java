package com.fams.hook;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericMapper;
import com.fams.engine.QuerySpec;
import com.fams.engine.RowCodec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.Map;
import java.util.Set;

/**
 * 退库限额（契约 5 节 / 错误码 1006）：仅作用于「低值资产退库单」。
 *
 * <p>可退数量 = 已领未退 = 领用总量(DONE) − 退库总量(DONE) − 审批中的退库量(PROCESSING，排除本行)。
 * 草稿状态不校验（与前端 mock 一致）。</p>
 */
@Component
@RequiredArgsConstructor
public class ReturnLimitHook implements ResourceHook {

    private static final String KEY = "low-value-return";

    private static final String REQUISITION = "low-value-requisition";

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    @Override
    public Set<String> keys() {
        return Collections.singleton(KEY);
    }

    @Override
    public void beforeCreate(ResourceMeta meta, Map<String, Object> row) {
        check(row, null);
    }

    @Override
    public void beforeUpdate(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
        Object selfId = previous == null ? null : previous.get(meta.getPkField());
        check(next, selfId == null ? null : String.valueOf(selfId));
    }

    private void check(Map<String, Object> row, String selfId) {
        Object status = row.get("status");
        if (status != null && !"DONE".equals(status) && !"PROCESSING".equals(status)) {
            return;
        }
        Object itemId = row.get("itemId");
        BigDecimal qty = RowCodec.toBigDecimal(row.get("quantity"));
        if (itemId == null || String.valueOf(itemId).trim().isEmpty() || qty == null || qty.signum() == 0) {
            return;
        }

        BigDecimal issued = sum(REQUISITION, itemId, "DONE", null);
        BigDecimal returned = sum(KEY, itemId, "DONE", null);
        BigDecimal pending = sum(KEY, itemId, "PROCESSING", selfId);
        BigDecimal available = issued.subtract(returned).subtract(pending);

        if (qty.compareTo(available) > 0) {
            throw new ApiException(ErrorCode.EXCEED_RETURNED,
                    "退库数量超出可退范围，当前可退 " + available.stripTrailingZeros().toPlainString());
        }
    }

    private BigDecimal sum(String collection, Object itemId, String status, String excludeId) {
        ResourceMeta meta = registry.resolve(collection);
        QuerySpec spec = new QuerySpec(meta).eq("itemId", itemId).eq("status", status);
        if (excludeId != null && !excludeId.isEmpty()) {
            spec.ne(meta.getPkField(), excludeId);
        }
        Map<String, Object> params = spec.toParams(meta.getAllColumns(), null, null);
        params.put("sumColumn", "quantity");
        BigDecimal total = mapper.sum(params);
        return total == null ? BigDecimal.ZERO : total;
    }
}
