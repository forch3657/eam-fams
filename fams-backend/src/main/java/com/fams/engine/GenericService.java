package com.fams.engine;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.common.PageResult;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.hook.HookRegistry;
import com.fams.hook.ResourceHook;
import com.fams.rule.RuleEngine;
import com.fams.security.AuthContext;
import com.fams.security.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * 通用 CRUD 引擎（契约 1.3）：一套实现服务全部集合的 8 个端点。
 *
 * <p>执行顺序严格遵循契约与前端 mock：
 * <ul>
 *   <li>create：校验 → 唯一性/外键 → 退库限额 → 审计 → 入库 → 库存联动</li>
 *   <li>update：定位 → <b>乐观锁比对最先</b> → 校验 → 唯一性/外键 → 退库限额 → 库存状态流转 → 审计</li>
 *   <li>remove：定位 → <b>删除保护（必须先于库存回退）</b> → 库存回退 → 级联 → 删除</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GenericService {

    private static final BigDecimal ZERO = BigDecimal.ZERO;

    private static final String ORG_USERS = "org-users";

    private static final String ORG_ROLES = "org-roles";

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    private final RuleEngine rules;

    private final HookRegistry hooks;

    private final RowCodec codec;

    private final QueryAssembler assembler;

    private final PasswordEncoder passwordEncoder;

    private final PasswordPolicy passwordPolicy;

    private final AtomicLong sequence = new AtomicLong();

    // ------------------------------------------------------------------ 读

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String key, Map<String, String[]> raw) {
        ResourceMeta meta = registry.resolve(key);
        return mapper.selectList(assembler.buildList(meta, raw)).stream()
                .map(row -> sanitized(meta, codec.toApiRow(meta, row)))
                .collect(Collectors.toList());
    }

    /**
     * 内部运维用途：读取<b>未经脱敏</b>的原始行。
     *
     * <p>口令迁移（{@code DataInitializer}）等运维逻辑必须拿到 password 列才能把明文迁移为 BCrypt；
     * 而 {@link #list} 出于安全已经把该字段剔除。严禁把本方法的返回值用于对外接口响应，
     * 否则会把用户口令哈希泄漏给任意拥有读权限的人。</p>
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listInternal(String key, Map<String, String[]> raw) {
        ResourceMeta meta = registry.resolve(key);
        return mapper.selectList(assembler.buildList(meta, raw)).stream()
                .map(row -> codec.toApiRow(meta, row))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PageResult page(String key, Map<String, String[]> raw) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> params = assembler.buildPage(meta, raw);
        long total = mapper.count(params);
        List<Map<String, Object>> rows = mapper.selectList(params).stream()
                .map(row -> sanitized(meta, codec.toApiRow(meta, row)))
                .collect(Collectors.toList());
        return new PageResult(rows, total, (Long) params.get("page"), (Long) params.get("pageSize"));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String key, String id) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = findById(meta, id);
        if (row == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "数据不存在");
        }
        return sanitized(meta, row);
    }

    // ------------------------------------------------------------------ 写

    @Transactional
    public Map<String, Object> create(String key, Map<String, Object> body) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, false);
        encodeOrgUserPasswordIfNeeded(key, row, true);

        Object pk = row.get(meta.getPkField());
        if (isBlank(pk)) {
            if (!meta.isIdGenerated()) {
                throw new ApiException(ErrorCode.VALIDATION, "缺少主键字段：" + meta.getPkField());
            }
            pk = nextId();
            row.put(meta.getPkField(), pk);
        }

        rules.validate(meta, row, null);
        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.beforeCreate(meta, row);
        }

        stampCreate(meta, row);
        mapper.insert(writeParams(meta, row, true));
        applyStockOnCreate(meta, row);

        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.afterCreate(meta, row);
        }
        return sanitized(meta, codec.toApiRow(meta, row));
    }

    private static final String BCRYPT_PREFIX = "$2";

    /**
     * org-users 的 password 字段：新建强制复杂度 + BCrypt；编辑时若留空则保留原哈希；
     * 若已是 BCrypt 哈希则不重复加密。避免新增用户口令明文落库（A18 同类问题）。
     */
    private void encodeOrgUserPasswordIfNeeded(String key, Map<String, Object> row, boolean isCreate) {
        if (!ORG_USERS.equals(key)) {
            return;
        }
        Object rawObj = row.get("password");
        if (!(rawObj instanceof String)) {
            if (isCreate) {
                passwordPolicy.validate(null, String.valueOf(row.get("username")));
            } else {
                // 编辑未传 password（null）：update 是全量替换，必须摘掉该列，
                // 否则会把已有 BCrypt 哈希覆盖成 NULL，用户直接登录不上。
                row.remove("password");
            }
            return;
        }
        String pwd = (String) rawObj;
        if (pwd.startsWith(BCRYPT_PREFIX)) {
            return; // 已是 BCrypt 哈希，不重复加密
        }
        if (pwd.isEmpty()) {
            if (isCreate) {
                passwordPolicy.validate(null, String.valueOf(row.get("username")));
            } else {
                row.remove("password"); // 编辑未填密码 → 保留原哈希
            }
            return;
        }
        passwordPolicy.validate(pwd, String.valueOf(row.get("username")));
        row.put("password", passwordEncoder.encode(pwd));
    }

    /**
     * 对外响应剔除 org-users 的 password（BCrypt 哈希也不回传，防离线爆破）。
     * 仅用于 list/page/get/create/update 等对外出口；
     * 认证内部链路 {@link #findByUsername} 不经过此处，仍能取到口令哈希。
     */
    private Map<String, Object> sanitized(ResourceMeta meta, Map<String, Object> apiRow) {
        if (apiRow != null && ORG_USERS.equals(meta.getKey())) {
            apiRow.remove("password");
        }
        return apiRow;
    }

    /**
     * 全量替换更新（契约 1.3）：body 里出现什么字段就存什么，缺失的字段被清空。
     * body 内的 id 一律忽略，以路径段 {id} 为准。
     */
    @Transactional
    public Map<String, Object> update(String key, String id, Map<String, Object> body) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> previous = findById(meta, id);
        if (previous == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "数据不存在");
        }
        // 乐观锁比对必须最先执行
        assertVersionMatch(meta, previous, body);

        Map<String, Object> next = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, true);
        next.put(meta.getPkField(), id);
        encodeOrgUserPasswordIfNeeded(key, next, false);

        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.beforeUpdate(meta, next, previous);
        }

        Map<String, Object> saved = writeUpdate(meta, id, next, previous);

        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.afterUpdate(meta, saved, previous);
        }
        return sanitized(meta, codec.toApiRow(meta, saved));
    }

    /**
     * 不触发钩子的更新：供「审批动作」这类**自带轨迹写入**的业务端点使用，
     * 避免与 {@link com.fams.hook.ApprovalTrailHook} 各写一条造成轨迹重复。
     */
    @Transactional
    public Map<String, Object> updateQuietly(String key, String id, Map<String, Object> body) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> previous = findById(meta, id);
        if (previous == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "数据不存在");
        }
        assertVersionMatch(meta, previous, body);
        Map<String, Object> next = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, true);
        next.put(meta.getPkField(), id);
        return sanitized(meta, codec.toApiRow(meta, writeUpdate(meta, id, next, previous)));
    }

    /** 校验 → 库存状态流转 → 审计 → 落库 */
    private Map<String, Object> writeUpdate(ResourceMeta meta, String id, Map<String, Object> next,
                                            Map<String, Object> previous) {
        rules.validate(meta, next, id);
        applyStockOnStatusChange(meta, next, previous);
        stampUpdate(meta, previous, next);
        mapper.updateById(writeParams(meta, next, false));
        return next;
    }

    @Transactional
    public boolean remove(String key, String id) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = findById(meta, id);
        if (row == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "数据不存在");
        }
        // 1) 删除保护：必须先于库存回退，否则会出现「报了 1003 但库存已回退」
        rules.checkProtect(meta, row);
        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.checkDelete(meta, row);
        }
        // 2) 库存反向回退
        applyStockOnDelete(meta, row);
        // 3) 级联清理动态子集合
        applyCascade(meta, row);
        // 4) 删除
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("id", row.get(meta.getPkField()));
        mapper.deleteById(params);

        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.afterDelete(meta, row);
        }
        return true;
    }

    /**
     * 批量保存（契约 1.3）：按主键 upsert，逐行做乐观锁比对。
     *
     * <p>与前端 mock 一致：**不执行**库存联动 / 删除保护 / 退库限额，
     * 它是"整表回写"通道，不是单据状态机。</p>
     */
    @Transactional
    public List<Map<String, Object>> batch(String key, List<Map<String, Object>> rows) {
        ResourceMeta meta = registry.resolve(key);
        List<Map<String, Object>> saved = new ArrayList<>();
        if (rows == null) {
            return saved;
        }
        for (Map<String, Object> body : rows) {
            Object pk = body == null ? null : body.get(meta.getPkField());
            Map<String, Object> existing = isBlank(pk) ? null : findById(meta, String.valueOf(pk));
            if (existing != null) {
                assertVersionMatch(meta, existing, body);
                Map<String, Object> next = codec.toDbRow(meta, body, true);
                next.put(meta.getPkField(), existing.get(meta.getPkField()));
                rules.validate(meta, next, String.valueOf(existing.get(meta.getPkField())));
                stampUpdate(meta, existing, next);
                mapper.updateById(writeParams(meta, next, false));
                saved.add(next);
            } else {
                Map<String, Object> row = codec.toDbRow(meta, body, false);
                if (isBlank(row.get(meta.getPkField()))) {
                    row.put(meta.getPkField(), nextId());
                }
                rules.validate(meta, row, null);
                stampCreate(meta, row);
                mapper.insert(writeParams(meta, row, true));
                saved.add(row);
            }
        }
        return saved;
    }

    /** 清空集合（契约 1.3）：无保护、无库存回退，与前端 mock 的 clear 一致 */
    @Transactional
    public boolean clear(String key) {
        ResourceMeta meta = registry.resolve(key);
        mapper.deleteAll(new QuerySpec(meta).toParams(meta.getAllColumns(), null, null));
        return true;
    }

    /**
     * 按主键删除单行，<b>不触发</b>删除保护 / 钩子 / 库存回退。
     *
     * <p>仅供「数据重置」这类运维场景使用（例如清空组织架构时保留当前登录账号）。
     * 业务删除必须走 {@link #remove}，否则会绕过保护规则。</p>
     */
    @Transactional
    public boolean deleteByIdQuietly(String key, Object id) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("id", id);
        mapper.deleteById(params);
        return true;
    }

    // ------------------------------------------------------------------ 内部

    /** 按账号取用户行（登录与鉴权共用） */
    @Transactional(readOnly = true)
    public Map<String, Object> findByUsername(String username) {
        ResourceMeta meta = registry.resolve(ORG_USERS);
        if (username == null || username.trim().isEmpty()) {
            return null;
        }
        Map<String, Object> params = assembler.buildList(meta,
                Collections.singletonMap("username", new String[]{username}));
        List<Map<String, Object>> rows = mapper.selectList(params).stream()
                .map(row -> codec.toApiRow(meta, row))
                .collect(Collectors.toList());
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 用户权限 = 各角色 permissions 的并集（契约 7.3） */
    @Transactional(readOnly = true)
    public Set<String> permissionsOf(Map<String, Object> user) {
        List<String> roleIds = asStringList(user.get("roleIds"));
        if (roleIds.isEmpty()) {
            return Collections.emptySet();
        }
        ResourceMeta roleMeta = registry.resolve(ORG_ROLES);
        QuerySpec spec = new QuerySpec(roleMeta).in(roleMeta.getPkField(), roleIds);
        List<Map<String, Object>> roles = mapper.selectList(spec.toParams(roleMeta.getAllColumns(), null, null)).stream()
                .map(row -> codec.toApiRow(roleMeta, row))
                .collect(Collectors.toList());
        Set<String> permissions = new LinkedHashSet<>();
        for (Map<String, Object> role : roles) {
            permissions.addAll(asStringList(role.get("permissions")));
        }
        return permissions;
    }

    /** 统计持有指定角色的启用用户数（审批环节「会签」判定用） */
    @Transactional(readOnly = true)
    public long countUsersOfRole(String roleId) {
        if (roleId == null || roleId.trim().isEmpty()) {
            return 0;
        }
        ResourceMeta meta = registry.resolve(ORG_USERS);
        long count = 0;
        for (Map<String, Object> row : mapper.selectList(
                assembler.buildList(meta, Collections.emptyMap()))) {
            Map<String, Object> api = codec.toApiRow(meta, row);
            if (!"ENABLED".equals(text(api.get("status")))) {
                continue;
            }
            if (asStringList(api.get("roleIds")).contains(roleId)) {
                count++;
            }
        }
        return count;
    }

    /** 指定用户是否持有某角色（审批权限判定用） */
    @Transactional(readOnly = true)
    public boolean userHasRole(String userId, String roleId) {
        if (userId == null || userId.trim().isEmpty() || roleId == null || roleId.trim().isEmpty()) {
            return false;
        }
        Map<String, Object> user = get(ORG_USERS, userId);
        return user != null && asStringList(user.get("roleIds")).contains(roleId);
    }

    /** 回填最后登录时间：直接更新列，避免触发 version 自增 */
    @Transactional
    public void touchLastLogin(String username) {
        patchField(ORG_USERS, username, "lastLoginAt", LocalDateTime.now(), "username");
    }

    /** 直接更新单列；不触发业务规则、不递增 version */
    @Transactional
    public void patchField(String key, Object id, String field, Object value) {
        patchField(key, id, field, value, null);
    }

    /**
     * @param byField 为空时按主键定位，否则按该字段名定位
     */
    @Transactional
    public void patchField(String key, Object id, String field, Object value, String byField) {
        ResourceMeta meta = registry.resolve(key);
        QuerySpec spec = byField == null
                ? new QuerySpec(meta).eqPrimary(id)
                : new QuerySpec(meta).eq(byField, id);
        Map<String, Object> params = spec.toParams(meta.getAllColumns(), null, null);
        // toParams 已把 where 的值放在 v（k0...），此处只追加待更新的值，不能整体替换 v
        Map<String, Object> values = new LinkedHashMap<>(valuesOf(params));
        values.put("f0", value);
        params.put("v", values);
        params.put("column", field);
        mapper.updateWhere(params);
    }

    private Map<String, Object> findById(ResourceMeta meta, String id) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("id", id);
        return codec.toApiRow(meta, mapper.selectById(params));
    }

    /** 单行加锁读取（库存变更前的悲观锁，防并发超卖） */
    private Map<String, Object> lockById(ResourceMeta meta, Object id) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("id", id);
        return codec.toApiRow(meta, mapper.selectForUpdate(params));
    }

    private Map<String, Object> writeParams(ResourceMeta meta, Map<String, Object> row, boolean includePk) {
        List<String> cols = new ArrayList<>();
        Map<String, Object> values = new LinkedHashMap<>();
        int i = 0;
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (!includePk && entry.getKey().equals(meta.getPkField())) {
                continue;
            }
            cols.add(entry.getKey());
            values.put("f" + i, entry.getValue());
            i++;
        }
        // 动态集合的固有列（如 dict_code）也要写入
        for (Map.Entry<String, Object> entry : meta.getFixedFilters().entrySet()) {
            cols.add(entry.getKey());
            values.put("f" + i, entry.getValue());
            i++;
        }
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("cols", cols);
        params.put("v", values);
        params.put("id", row.get(meta.getPkField()));
        return params;
    }

    private void stampCreate(ResourceMeta meta, Map<String, Object> row) {
        LocalDateTime now = LocalDateTime.now();
        String operator = AuthContext.currentUsername();
        row.put("createBy", operator);
        row.put("createTime", now);
        row.put("updateBy", operator);
        row.put("updateTime", now);
        row.put("version", 1);
    }

    private void stampUpdate(ResourceMeta meta, Map<String, Object> previous, Map<String, Object> next) {
        int current = previous.get("version") == null ? 0 : RowCodec.toBigDecimal(previous.get("version")).intValue();
        next.put("createBy", previous.get("createBy"));
        next.put("createTime", previous.get("createTime"));
        next.put("updateBy", AuthContext.currentUsername());
        next.put("updateTime", LocalDateTime.now());
        next.put("version", current + 1);
    }

    /** 乐观锁：body 未携带 version 视为不参与并发控制，放行 */
    private void assertVersionMatch(ResourceMeta meta, Map<String, Object> previous, Map<String, Object> body) {
        if (!meta.isAudit() || body == null) {
            return;
        }
        Object given = body.get("version");
        if (isBlank(given)) {
            return;
        }
        BigDecimal submitted = RowCodec.toBigDecimal(given);
        if (submitted == null) {
            return;
        }
        Object raw = previous.get("version");
        BigDecimal current = raw == null ? ZERO : RowCodec.toBigDecimal(raw);
        if (current == null) {
            current = ZERO;
        }
        if (current.compareTo(submitted) != 0) {
            throw new ApiException(ErrorCode.CONFLICT, "数据已被他人修改（当前版本 "
                    + current.stripTrailingZeros().toPlainString() + "，你基于版本 "
                    + submitted.stripTrailingZeros().toPlainString() + "），请刷新后重试");
        }
    }

    private void applyStockOnCreate(ResourceMeta meta, Map<String, Object> row) {
        ResourceMeta.Stock stock = meta.getStock();
        if (stock == null) {
            return;
        }
        String status = text(row.get("status"));
        // 无 settleOn 表示创建即生效；否则只在结算状态生效
        if (stock.getSettleOn() == null || stock.getSettleOn().equals(status)) {
            applyStock(meta, row, false);
            return;
        }
        // 建单即为审批中的，直接预占（与更新到该状态的行为保持一致）
        if (stock.getReservedField() != null && stock.getReserveOn() != null
                && stock.getReserveOn().equals(status)) {
            reserveStock(meta, row);
        }
    }

    private void applyStockOnDelete(ResourceMeta meta, Map<String, Object> row) {
        ResourceMeta.Stock stock = meta.getStock();
        if (stock == null) {
            return;
        }
        String status = text(row.get("status"));
        if (stock.getSettleOn() == null || stock.getSettleOn().equals(status)) {
            applyStock(meta, row, true);
        } else if (stock.getReservedField() != null && stock.getReserveOn() != null
                && stock.getReserveOn().equals(status)) {
            releaseStock(meta, row);
        }
    }

    private void applyStockOnStatusChange(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
        ResourceMeta.Stock stock = meta.getStock();
        if (stock == null) {
            return;
        }
        String oldStatus = text(previous.get("status"));
        String newStatus = text(next.get("status"));
        if (oldStatus.equals(newStatus)) {
            return;
        }
        // 已完结单据不允许再改数量
        if (stock.getSettleOn() != null && stock.getSettleOn().equals(oldStatus)
                && !sameQuantity(next, previous, stock.getQtyField())) {
            throw new ApiException(ErrorCode.CONFLICT, "单据已生效，不能修改数量");
        }
        if (stock.getSettleOn() != null && stock.getSettleOn().equals(newStatus)) {
            // 先结算再释放预占，避免半途失败丢占用
            applyStock(meta, next, false);
            releaseStock(meta, next);
        } else if (stock.getSettleOn() != null && stock.getSettleOn().equals(oldStatus)) {
            // 撤销结算：按原数量反向回退
            applyStock(meta, previous, true);
        } else if (stock.getReserveOn() != null && stock.getReserveOn().equals(newStatus)) {
            reserveStock(meta, next);
        } else if (stock.getReleaseOn() != null && stock.getReleaseOn().contains(newStatus)) {
            releaseStock(meta, next);
        }
    }

    /** 结算：stock ± qty（delete 时反向） */
    private void applyStock(ResourceMeta meta, Map<String, Object> doc, boolean rollback) {
        ResourceMeta.Stock stock = meta.getStock();
        Object itemId = doc.get(stock.getItemField() == null ? "itemId" : stock.getItemField());
        BigDecimal qty = RowCodec.toBigDecimal(doc.get(stock.getQtyField()));
        if (isBlank(itemId) || qty == null || qty.signum() == 0) {
            return;
        }
        ResourceMeta itemMeta = registry.resolve(stock.getTarget());
        Map<String, Object> item = lockById(itemMeta, itemId);
        if (item == null) {
            throw new ApiException(ErrorCode.REF_NOT_FOUND, "关联物品不存在（" + stock.getTarget() + ": " + itemId + "）");
        }
        BigDecimal current = RowCodec.toBigDecimal(item.get(stock.getStockField()));
        if (current == null) {
            current = ZERO;
        }
        int sign = (stock.isOut() ? -1 : 1) * (rollback ? -1 : 1);
        BigDecimal next = current.add(qty.multiply(BigDecimal.valueOf(sign)));
        if (next.compareTo(ZERO) < 0) {
            throw new ApiException(ErrorCode.STOCK_INSUFFICIENT, "库存不足，当前可用 " + current.stripTrailingZeros().toPlainString());
        }
        updateColumn(itemMeta, itemId, stock.getStockField(), next);
    }

    /** 预占：available = stock - reserved，不足报 1001 */
    private void reserveStock(ResourceMeta meta, Map<String, Object> doc) {
        ResourceMeta.Stock stock = meta.getStock();
        if (stock.getReservedField() == null) {
            return;
        }
        Object itemId = doc.get(stock.getItemField() == null ? "itemId" : stock.getItemField());
        BigDecimal qty = RowCodec.toBigDecimal(doc.get(stock.getQtyField()));
        if (isBlank(itemId) || qty == null || qty.signum() == 0) {
            return;
        }
        ResourceMeta itemMeta = registry.resolve(stock.getTarget());
        Map<String, Object> item = lockById(itemMeta, itemId);
        if (item == null) {
            throw new ApiException(ErrorCode.REF_NOT_FOUND, "关联物品不存在（" + stock.getTarget() + ": " + itemId + "）");
        }
        BigDecimal stockQty = RowCodec.toBigDecimal(item.get(stock.getStockField()));
        BigDecimal reserved = RowCodec.toBigDecimal(item.get(stock.getReservedField()));
        if (stockQty == null) stockQty = ZERO;
        if (reserved == null) reserved = ZERO;
        BigDecimal available = stockQty.subtract(reserved);
        if (available.compareTo(qty) < 0) {
            throw new ApiException(ErrorCode.STOCK_INSUFFICIENT,
                    "可用库存不足，当前可用 " + available.stripTrailingZeros().toPlainString());
        }
        updateColumn(itemMeta, itemId, stock.getReservedField(), reserved.add(qty));
    }

    /** 释放预占：reserved = max(0, reserved - qty) */
    private void releaseStock(ResourceMeta meta, Map<String, Object> doc) {
        ResourceMeta.Stock stock = meta.getStock();
        if (stock.getReservedField() == null) {
            return;
        }
        Object itemId = doc.get(stock.getItemField() == null ? "itemId" : stock.getItemField());
        BigDecimal qty = RowCodec.toBigDecimal(doc.get(stock.getQtyField()));
        if (isBlank(itemId) || qty == null || qty.signum() == 0) {
            return;
        }
        ResourceMeta itemMeta = registry.resolve(stock.getTarget());
        Map<String, Object> item = lockById(itemMeta, itemId);
        if (item == null) {
            return; // 释放时物品缺失静默返回（与前端 mock 一致）
        }
        BigDecimal reserved = RowCodec.toBigDecimal(item.get(stock.getReservedField()));
        if (reserved == null) {
            reserved = ZERO;
        }
        BigDecimal next = reserved.subtract(qty);
        if (next.compareTo(ZERO) < 0) {
            next = ZERO;
        }
        updateColumn(itemMeta, itemId, stock.getReservedField(), next);
    }

    private void updateColumn(ResourceMeta meta, Object id, String field, Object value) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("f0", value);
        params.put("v", values);
        params.put("id", id);
        params.put("column", field);
        mapper.updateColumn(params);
    }

    /** 级联删除：如删除字典类型时清理其字典项集合 */
    private void applyCascade(ResourceMeta meta, Map<String, Object> row) {
        for (ResourceMeta.Cascade cascade : meta.getCascade()) {
            String pattern = cascade.getPattern();
            if (pattern == null || !pattern.contains("{code}")) {
                continue;
            }
            Object code = row.get(meta.getPkField());
            if (isBlank(code)) {
                continue;
            }
            String key = pattern.replace("{code}", String.valueOf(code));
            ResourceMeta child = registry.resolve(key);
            mapper.deleteAll(new QuerySpec(child).toParams(child.getAllColumns(), null, null));
        }
    }

    private void stampCreateGuard(ResourceMeta meta) {
        // 占位：审计字段统一由 stampCreate/stampUpdate 写入
    }

    private static boolean sameQuantity(Map<String, Object> a, Map<String, Object> b, String field) {
        BigDecimal left = RowCodec.toBigDecimal(a.get(field));
        BigDecimal right = RowCodec.toBigDecimal(b.get(field));
        if (left == null && right == null) {
            return true;
        }
        if (left == null || right == null) {
            return false;
        }
        return left.compareTo(right) == 0;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> valuesOf(Map<String, Object> params) {
        Object v = params.get("v");
        return v instanceof Map ? (Map<String, Object>) v : Collections.emptyMap();
    }

    private static boolean isBlank(Object value) {
        return value == null || String.valueOf(value).trim().isEmpty();
    }

    /** 统一把 JSON 数组 / List / 单个字符串转成字符串列表 */
    static List<String> asStringList(Object value) {
        if (value == null) {
            return Collections.emptyList();
        }
        if (value instanceof Iterable) {
            List<String> out = new ArrayList<>();
            for (Object item : (Iterable<?>) value) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
            return out;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return Collections.emptyList();
        }
        if (text.startsWith("[")) {
            Object parsed = RowCodec.parseJsonSafe(text);
            if (parsed instanceof Iterable) {
                return asStringList(parsed);
            }
        }
        return Collections.singletonList(text);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String nextId() {
        return Long.toString(System.currentTimeMillis(), 36) + sequence.incrementAndGet();
    }
}
