package com.fams.rule;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.EnumCatalog;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericMapper;
import com.fams.engine.Names;
import com.fams.engine.QuerySpec;
import com.fams.engine.RowCodec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 契约第 5 节业务规则引擎。
 *
 * <p>删除保护（protect / protectContains / protectSelf / stockGuard）是契约里声明式定义的，
 * 由本引擎按元数据逐条执行，无需为每个集合写钩子。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RuleEngine {

    /** 数组包含检查时的最大扫描行数（demo 量级；生产应改用 SQL JSON 函数或关联表） */
    private static final int SCAN_LIMIT = 5000;

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    private final EnumCatalog enumCatalog;

    /**
     * 写入前校验。
     *
     * @param excludePk 更新时排除自身主键（避免唯一性把自己判为冲突）
     */
    public void validate(ResourceMeta meta, Map<String, Object> row, String excludePk) {
        List<Map<String, String>> details = new ArrayList<>();

        for (ResourceMeta.Field field : meta.getFields()) {
            Object value = row.get(field.getName());
            boolean blank = value == null || String.valueOf(value).trim().isEmpty();
            if (field.isRequired() && blank) {
                details.add(detail(field.getName(), "不能为空"));
                continue;
            }
            if (field.isEnum() && !blank && !enumCatalog.isValid(field.getEnumName(), value)) {
                details.add(detail(field.getName(), "取值 " + value + " 不在枚举 " + field.getEnumName() + " 中"));
            }
        }

        if (!details.isEmpty()) {
            String message = "数据校验未通过：" + join(details);
            throw new ApiException(ErrorCode.VALIDATION, message, details);
        }

        validateUnique(meta, row, excludePk);
        validateRefs(meta, row);
    }

    private void validateUnique(ResourceMeta meta, Map<String, Object> row, String excludePk) {
        for (String field : meta.getUniqueFields()) {
            Object value = row.get(field);
            if (value == null || String.valueOf(value).trim().isEmpty()) {
                continue;
            }
            QuerySpec spec = new QuerySpec(meta).eq(field, value);
            if (excludePk != null && !excludePk.isEmpty()) {
                spec.ne(meta.getPkField(), excludePk);
            }
            if (mapper.count(spec.toParams(meta.getAllColumns(), null, null)) > 0) {
                throw new ApiException(ErrorCode.CONFLICT, field + "「" + value + "」已存在，不能重复");
            }
        }
    }

    private void validateRefs(ResourceMeta meta, Map<String, Object> row) {
        for (ResourceMeta.Ref ref : meta.getRefs()) {
            Object value = row.get(ref.getField());
            if (value == null || String.valueOf(value).trim().isEmpty()) {
                continue;
            }
            ResourceMeta target = registry.resolve(ref.getCollection());
            QuerySpec spec = new QuerySpec(target).eqPrimary(value);
            if (mapper.count(spec.toParams(target.getAllColumns(), null, null)) == 0) {
                throw new ApiException(ErrorCode.REF_NOT_FOUND,
                        ref.getField() + " 引用的记录不存在（" + ref.getCollection() + ": " + value + "）");
            }
        }
    }

    /**
     * 删除保护：必须在库存回退之前执行，否则会出现「报了 1003 但库存已回退」的脏数据。
     */
    public void checkProtect(ResourceMeta meta, Map<String, Object> row) {
        Object pkValue = row.get(meta.getPkField());

        // 1) 跨集合引用（含按 valueFrom 取值，如位置按 name 匹配）
        for (ResourceMeta.Protect p : meta.getProtect()) {
            Object value = p.getValueFrom() != null && !p.getValueFrom().isEmpty()
                    ? row.get(p.getValueFrom())
                    : pkValue;
            if (value == null || String.valueOf(value).trim().isEmpty()) {
                continue;
            }
            ResourceMeta target = registry.resolve(p.getCollection());
            QuerySpec spec = new QuerySpec(target).eq(p.getField(), value);
            if (mapper.count(spec.toParams(target.getAllColumns(), null, null)) > 0) {
                // 契约 5.x：本集合内的父子引用（子部门/子分类/子公司）报 1002，
                // 跨集合引用（部门下有人员、资产有单据）报 1003
                ErrorCode code = p.getCollection().equals(meta.getKey())
                        ? ErrorCode.HAS_CHILDREN : ErrorCode.HAS_REFERENCE;
                throw new ApiException(code, p.getMessage());
            }
        }

        // 2) 数组包含（如 org-users.roleIds 包含角色 id）
        for (ResourceMeta.ProtectContains pc : meta.getProtectContains()) {
            if (pkValue == null || String.valueOf(pkValue).isEmpty()) {
                continue;
            }
            if (arrayContains(pc.getCollection(), pc.getField(), String.valueOf(pkValue))) {
                throw new ApiException(ErrorCode.HAS_REFERENCE, pc.getMessage());
            }
        }

        // 3) 自引用（如分类的 parentCode）
        ResourceMeta.ProtectSelf ps = meta.getProtectSelf();
        if (ps != null) {
            String idField = ps.getIdField() != null && !ps.getIdField().isEmpty()
                    ? ps.getIdField() : meta.getPkField();
            Object value = row.get(idField);
            if (value != null && !String.valueOf(value).trim().isEmpty()) {
                QuerySpec spec = new QuerySpec(meta).eq(ps.getField(), value);
                if (mapper.count(spec.toParams(meta.getAllColumns(), null, null)) > 0) {
                    throw new ApiException(ErrorCode.HAS_CHILDREN, ps.getMessage());
                }
            }
        }

        // 4) 数量守卫（如低值物品仍有库存/预占）
        for (ResourceMeta.StockGuard guard : meta.getStockGuard()) {
            BigDecimal amount = RowCodec.toBigDecimal(row.get(guard.getField()));
            if (amount != null && amount.compareTo(BigDecimal.ZERO) > 0) {
                throw new ApiException(ErrorCode.HAS_REFERENCE, guard.getMessage());
            }
        }
    }

    /** 判断目标集合中，是否存在某行的数组字段包含指定值 */
    private boolean arrayContains(String collection, String field, String value) {
        ResourceMeta target = registry.resolve(collection);
        Map<String, Object> params = new QuerySpec(target)
                .toParams(target.getAllColumns(), (long) SCAN_LIMIT, 0L);
        List<Map<String, Object>> rows = mapper.selectList(params);
        for (Map<String, Object> row : rows) {
            Object raw = row.get(Names.camelToSnake(field));
            Object parsed = raw instanceof String ? RowCodec.parseJsonSafe(raw.toString()) : raw;
            if (parsed instanceof Iterable) {
                for (Object item : (Iterable<?>) parsed) {
                    if (value.equals(String.valueOf(item))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static Map<String, String> detail(String field, String message) {
        Map<String, String> m = new HashMap<>(4);
        m.put("field", field);
        m.put("message", message);
        return m;
    }

    private static String join(List<Map<String, String>> details) {
        return details.stream()
                .map(d -> d.get("field") + " " + d.get("message"))
                .collect(Collectors.joining("；"));
    }
}
