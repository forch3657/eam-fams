package com.fams.hook;

import com.fams.contract.EnumCatalog;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericMapper;
import com.fams.engine.QuerySpec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 低值单据快照保护（契约 5 节「快照字段不可覆盖」）。
 *
 * <p>入库 / 领用 / 退库单带 itemName / categoryName / spec / unit / price 五个快照字段，
 * 记录办理当时的物品信息：
 * <ul>
 *   <li>新增时若前端未传，则由服务端按物品当前信息补全；</li>
 *   <li>更新时一律沿用历史值，防止物品改名/改价后污染历史单据。</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class SnapshotHook implements ResourceHook {

    private static final Set<String> KEYS = Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "low-value-inbound", "low-value-requisition", "low-value-return")));

    private static final List<String> SNAPSHOT_FIELDS = Collections.unmodifiableList(Arrays.asList(
            "itemName", "categoryName", "spec", "unit", "price"));

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    private final EnumCatalog enumCatalog;

    @Override
    public Set<String> keys() {
        return KEYS;
    }

    @Override
    public void beforeCreate(ResourceMeta meta, Map<String, Object> row) {
        Map<String, Object> item = findItem(row.get("itemId"));
        if (item == null) {
            return;
        }
        putIfBlank(row, "itemName", item.get("name"));
        putIfBlank(row, "categoryName", enumCatalog.label("LOW_VALUE_CATEGORY", item.get("category")));
        putIfBlank(row, "spec", item.get("spec"));
        putIfBlank(row, "unit", item.get("unit"));
        putIfBlank(row, "price", item.get("price"));
    }

    @Override
    public void beforeUpdate(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
        if (previous == null) {
            return;
        }
        // 快照字段不可被覆盖：始终沿用首次写入时的历史值
        for (String field : SNAPSHOT_FIELDS) {
            Object historic = previous.get(field);
            if (historic != null) {
                next.put(field, historic);
            }
        }
    }

    private Map<String, Object> findItem(Object itemId) {
        if (itemId == null || String.valueOf(itemId).trim().isEmpty()) {
            return null;
        }
        ResourceMeta meta = registry.resolve("low-value-items");
        Map<String, Object> params = new QuerySpec(meta).eqPrimary(itemId).toParams(meta.getAllColumns(), null, null);
        params.put("id", itemId);
        Map<String, Object> row = mapper.selectById(params);
        return row == null ? null : new java.util.LinkedHashMap<>(row);
    }

    private static void putIfBlank(Map<String, Object> row, String field, Object value) {
        if (value == null) {
            return;
        }
        Object current = row.get(field);
        if (current == null || String.valueOf(current).trim().isEmpty()) {
            row.put(field, value);
        }
    }
}
