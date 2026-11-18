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
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

    /** 一人多岗：用户岗位子表（每个岗位独立公司/部门/角色） */
    private static final String ORG_USER_POSITIONS = "org-user-positions";

    /**
     * 低值三类单据的单号前缀。
     *
     * <p>单号必须由服务端生成：前端按自己可见的列表推算序号，而列表受数据范围过滤
     * （部门/本人），看不到其他部门的单号，必然撞 unique 约束（2026-11-02 用户建领用直接 409）。</p>
     */
    private static final Map<String, String> DOC_NO_PREFIX = new java.util.LinkedHashMap<>();

    /**
     * 单号按「前缀 + 日期 + 当日序号」生成的集合（盘点单：PD20261104001）。
     *
     * <p>盘点单同样不能由前端推算单号：可见列表受数据范围过滤，
     * 两个管理员同一天各建一张盘点单就会撞 unique 约束。</p>
     */
    private static final Map<String, String> DOC_NO_DATE_PREFIX = new java.util.LinkedHashMap<>();

    /**
     * 单号按「前缀 + 年份 + 序号」生成的集合（盘点计划：PD-2026-001）。
     *
     * <p>与盘点单同理：计划单号唯一，前端按可见列表长度推算必然撞号。</p>
     */
    private static final Map<String, String> DOC_NO_YEAR_DASH_PREFIX = new java.util.LinkedHashMap<>();

    static {
        DOC_NO_PREFIX.put("low-value-inbound", "RK");
        DOC_NO_PREFIX.put("low-value-requisition", "PY");
        DOC_NO_PREFIX.put("low-value-return", "TK");
        DOC_NO_DATE_PREFIX.put("fixed-asset-inventory-docs", "PD");
        DOC_NO_YEAR_DASH_PREFIX.put("fixed-asset-inventory-plans", "PD-");
    }

    /** 固资单据编号：字母前缀 + 4 位年份 + 序号（如 FP20261000） */
    private static final Pattern FIXED_DOC_CODE = Pattern.compile("^([A-Za-z]+)(\\d{4})(\\d+)$");

    private final ResourceRegistry registry;

    private final GenericMapper mapper;

    private final RuleEngine rules;

    private final HookRegistry hooks;

    private final RowCodec codec;

    private final QueryAssembler assembler;

    private final PasswordEncoder passwordEncoder;

    private final PasswordPolicy passwordPolicy;

    private final AtomicLong sequence = new AtomicLong();

    /** 统一行级范围断言（D1）：所有读写路径共用，避免按 id 或直调服务绕过数据范围 */
    private final RowScopeGuard scopeGuard;

    // ------------------------------------------------------------------ 读

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String key, Map<String, String[]> raw) {
        ResourceMeta meta = registry.resolve(key);
        return mapper.selectList(assembler.buildList(meta, scopedRaw(key, meta, raw))).stream()
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
        return mapper.selectList(assembler.buildList(meta, scopedRaw(key, meta, raw))).stream()
                .map(row -> codec.toApiRow(meta, row))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PageResult page(String key, Map<String, String[]> raw) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> params = assembler.buildPage(meta, scopedRaw(key, meta, raw));
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
        scopeGuard.assertRead(key, row);
        return sanitized(meta, row);
    }

    // ------------------------------------------------------------------ 写

    @Transactional
    public Map<String, Object> create(String key, Map<String, Object> body) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, false);
        scopeGuard.assertWrite(key, row, null);
        assertStatusServerOwned(meta, row, null);
        encodeOrgUserPasswordIfNeeded(key, row, true);

        // 低值单据 / 盘点单：单号留空时由服务端生成，保证跨部门唯一
        String docNoPrefix = DOC_NO_PREFIX.get(key);
        if (docNoPrefix != null && isBlank(row.get("docNo"))) {
            row.put("docNo", nextDocNo(meta, docNoPrefix));
        }
        String docNoDatePrefix = DOC_NO_DATE_PREFIX.get(key);
        if (docNoDatePrefix != null && isBlank(row.get("docNo"))) {
            row.put("docNo", nextDocNoByDate(meta, docNoDatePrefix));
        }
        // 盘点计划：单号是 planNo，同样由服务端生成（前端按列表长度推算会撞号）
        String planNoPrefix = DOC_NO_YEAR_DASH_PREFIX.get(key);
        if (planNoPrefix != null && isBlank(row.get("planNo"))) {
            row.put("planNo", nextDocNoByYearDash(meta, planNoPrefix));
        }
        // 用户编号：留空时按全表 YH- 最大序号自动生成；与内部主键 id 分离
        if ("org-users".equals(key) && meta.isKnownField("userNo") && isBlank(row.get("userNo"))) {
            row.put("userNo", nextUserNo(meta));
        }

        Object pk = row.get(meta.getPkField());
        if (isBlank(pk)) {
            if (!meta.isIdGenerated()) {
                throw new ApiException(ErrorCode.VALIDATION, "缺少主键字段：" + meta.getPkField());
            }
            pk = nextId();
            row.put(meta.getPkField(), pk);
        }

        // 固资单据编号由前端按可见列表推算，列表受数据范围/分页影响可能算出已存在的号
        ensureUniqueFixedDocCode(key, meta, row);
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

    /**
     * 独立事务创建：供「审批完结后派生单据」这类场景使用。
     *
     * <p>派生单据失败时只回滚它自己；留在主事务里的话，一次编号冲突就会把主事务
     * 标记成 rollback-only，审批动作在提交阶段抛 UnexpectedRollbackException，
     * 整个请求变成 500「服务异常」——盘点单卡在审批中，错误信息还完全对不上号。</p>
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Map<String, Object> createIndependent(String key, Map<String, Object> body) {
        return create(key, body);
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
        scopeGuard.assertRead(key, previous);
        // 乐观锁比对必须最先执行
        assertVersionMatch(meta, previous, body);
        // D3：body 携带 version 时，把版本断言下推到 UPDATE 条件，消除 TOCTOU 窗口
        Object expectedVersion = body == null ? null : body.get("version");
        // 审批中的固资单据禁止通过通用 CRUD 改写（审批动作走 updateQuietly）
        assertDocMutable(key, previous, false);

        Map<String, Object> next = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, true);
        next.put(meta.getPkField(), id);
        scopeGuard.assertWrite(key, next, previous);
        assertStatusServerOwned(meta, next, previous);
        encodeOrgUserPasswordIfNeeded(key, next, false);
        // 用户编号：编辑时若未带编号，沿用原值；历史数据为空则补生成（避免全量替换清空它）
        if ("org-users".equals(key) && meta.isKnownField("userNo") && isBlank(next.get("userNo"))) {
            Object oldNo = previous.get("userNo");
            next.put("userNo", isBlank(oldNo) ? nextUserNo(meta) : oldNo);
        }

        for (ResourceHook hook : hooks.forCollection(key)) {
            hook.beforeUpdate(meta, next, previous);
        }

        Map<String, Object> saved = writeUpdate(meta, id, next, previous, expectedVersion);

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
        scopeGuard.assertRead(key, previous);
        assertVersionMatch(meta, previous, body);
        Object expectedVersion = body == null ? null : body.get("version");
        Map<String, Object> next = codec.toDbRow(meta, body == null ? Collections.emptyMap() : body, true);
        next.put(meta.getPkField(), id);
        scopeGuard.assertWrite(key, next, previous);
        return sanitized(meta, codec.toApiRow(meta, writeUpdate(meta, id, next, previous, expectedVersion)));
    }

    /**
     * 单据状态守卫：已进入审批（PROCESSING）或已完结（DONE）的单据只能通过审批端点流转，
     * 通用 CRUD 的改写一律 409，避免绕过状态机篡改单据或抹掉审批上下文。
     *
     * <p>盘点单同样受守卫约束：盘点明细就是审批对象，审批期间还能改明细、
     * 甚至把单据删掉，审批结论就失去意义了。</p>
     *
     * <p>维修验收、派发退库、盘点结论等单据完结时服务端已按结论回写资产台账，
     * 再改单据内容会让台账与审批轨迹对不上。完结单据是审计凭证，删除只留系统管理员 R1
     * 做数据回收（状态机矩阵 P7-03、盘点 E2E 清理都用 admin）；普通账号即使绕过前端
     * 直接调接口也要挡住，前端 canDeleteRow / canDeleteInvDoc 与本守卫同源。</p>
     */
    private void assertDocMutable(String key, Map<String, Object> row, boolean deleting) {
        if (key == null) {
            return;
        }
        // 作废 / 终止后的单据是审计凭证：内容与轨迹不得被通用 CRUD 改写。
        // 删除只留管理员做数据回收（前端不提供作废单删除入口），避免普通账号抹掉历史。
        if ("REVOKED".equalsIgnoreCase(text(row.get("status")))) {
            if (!deleting || !isSystemAdmin()) {
                throw new ApiException(ErrorCode.CONFLICT, "已作废的单据不能修改或删除，请另开新单");
            }
            return;
        }
        boolean guarded = key.startsWith("fixed-asset-doc-lists-") || "fixed-asset-inventory-docs".equals(key);
        if (!guarded) {
            return;
        }
        String status = text(row.get("status"));
        if ("PROCESSING".equalsIgnoreCase(status)) {
            throw new ApiException(ErrorCode.CONFLICT, "审批中的单据不能修改或删除，请先撤销审批");
        }
        if ("DONE".equalsIgnoreCase(status)) {
            if (!deleting) {
                throw new ApiException(ErrorCode.CONFLICT, "已完结的单据不能修改，请另开新单");
            }
            // 8 类固资单据与盘点单一视同仁：完结单据只有系统管理员能删
            if (!isSystemAdmin()) {
                throw new ApiException(ErrorCode.FORBIDDEN, "已完结的单据仅系统管理员可删除");
            }
        }
    }

    /**
     * S-06：带库存状态机的低值单据，status 由服务端/审批端点驱动，通用 CRUD 不得直接改写。
     *
     * <p>只有契约中配置了 {@code stock} 的集合受此约束（入库 / 领用 / 退库）。
     * 合法路径：审批动作走 {@link #updateQuietly}（不经本守卫）；系统管理员 R1 保留维护通道，
     * 供期初数据修复与 P4 库存状态机测试使用。普通业务账号即使有 lv:* 权限码，
     * 也不能用通用 PUT/POST/batch 把单据直接改成 DONE/PROCESSING 来绕过审批结算库存。</p>
     *
     * @param previous 为 null 表示新建；非 null 表示更新
     */
    private void assertStatusServerOwned(ResourceMeta meta, Map<String, Object> row, Map<String, Object> previous) {
        if (meta == null || meta.getStock() == null || isSystemAdmin()) {
            return;
        }
        // 无登录主体的内部直调（审批派生、测试夹具、后台任务）不走 HTTP 权限码，
        // 状态由服务端业务代码控制，无需拦截；外部请求一律带主体。
        if (AuthContext.current() == null) {
            return;
        }
        String desired = text(row.get("status"));
        if (previous == null) {
            // 新建只能是 DRAFT（审批中的单据由审批端点提交产生，不在此放行）
            if (!desired.isEmpty() && !"DRAFT".equalsIgnoreCase(desired)) {
                throw new ApiException(ErrorCode.FORBIDDEN, "单据状态由审批流程驱动，新建仅允许草稿 DRAFT");
            }
            return;
        }
        String current = text(previous.get("status"));
        if (!desired.equalsIgnoreCase(current)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "单据状态由审批流程驱动，请通过审批端点流转");
        }
    }

    /** 当前登录人是否为系统管理员（R1）：以主数据角色为准，不信客户端传值 */
    private boolean isSystemAdmin() {
        String me = AuthContext.currentUserId();
        return me != null && !me.isEmpty() && userHasRole(me, "R1");
    }

    /** 校验 → 库存状态流转 → 审计 → 落库 */
    private Map<String, Object> writeUpdate(ResourceMeta meta, String id, Map<String, Object> next,
                                            Map<String, Object> previous, Object expectedVersion) {
        rules.validate(meta, next, id);
        applyStockOnStatusChange(meta, next, previous);
        stampUpdate(meta, previous, next);
        Map<String, Object> params = writeParams(meta, next, false);
        // D3：仅在调用方显式携带 version 时下推乐观锁条件；affected=0 视为并发冲突
        if (expectedVersion != null && meta.isAudit()) {
            params.put("expectedVersion", RowCodec.toBigDecimal(expectedVersion));
        }
        int affected = mapper.updateById(params);
        if (params.containsKey("expectedVersion") && affected == 0) {
            throw new ApiException(ErrorCode.CONFLICT,
                    "数据已被他人修改（并发冲突），请刷新后重试");
        }
        return next;
    }

    @Transactional
    public boolean remove(String key, String id) {
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = findById(meta, id);
        if (row == null) {
            throw new ApiException(ErrorCode.NOT_FOUND, "数据不存在");
        }
        scopeGuard.assertRead(key, row);
        // 0) 审批中的固资单据禁止删除
        assertDocMutable(key, row, true);
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
        if ("org-companies".equals(key) || "org-departments".equals(key)) {
            scopeGuard.invalidateCompanies();
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
                scopeGuard.assertWrite(key, next, existing);
                assertStatusServerOwned(meta, next, existing);
                rules.validate(meta, next, String.valueOf(existing.get(meta.getPkField())));
                stampUpdate(meta, existing, next);
                mapper.updateById(writeParams(meta, next, false));
                saved.add(next);
            } else {
                Map<String, Object> row = codec.toDbRow(meta, body, false);
                scopeGuard.assertWrite(key, row, null);
                assertStatusServerOwned(meta, row, null);
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
        scopeGuard.assertClear(key);
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
        scopeGuard.assertRead(key, findById(meta, String.valueOf(id)));
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

    // ------------------------------------------------------------------ 一人多岗

    /**
     * 读取用户某个「启用」岗位：校验岗位确实属于该用户，防止伪造 positionId 提权。
     * 岗位不存在 / 停用 / 不属于该用户时返回 null，由调用方回落到主职。
     */
    @Transactional(readOnly = true)
    public Map<String, Object> activePositionOf(String userId, String positionId) {
        if (userId == null || userId.trim().isEmpty() || positionId == null || positionId.trim().isEmpty()) {
            return null;
        }
        // 直接按主键读原始行，绕开行级公司范围：切换岗位正是要从当前公司切到另一家公司，
        // 若走 get() 的 assertRead 会拒绝读取目标岗位。归属校验由下方 userId 比对保证。
        ResourceMeta meta = registry.resolve(ORG_USER_POSITIONS);
        Map<String, Object> row = codec.toApiRow(meta, findById(meta, positionId.trim()));
        if (row == null || row.isEmpty() || !"ENABLED".equalsIgnoreCase(text(row.get("status")))) {
            return null;
        }
        if (!userId.equals(text(row.get("userId")))) {
            return null;
        }
        return row;
    }

    /** 取主数据名称（公司/部门），内部展示用；绕开行级范围避免非管理员读不到岗位公司名 */
    @Transactional(readOnly = true)
    public String nameOf(String key, String id) {
        if (id == null || id.trim().isEmpty()) {
            return "";
        }
        ResourceMeta meta = registry.resolve(key);
        Map<String, Object> row = codec.toApiRow(meta, findById(meta, id));
        return row == null ? "" : text(row.get("name"));
    }

    /** 用户全部启用岗位（含主职），供前端切换器与审批解析使用 */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> positionsOfUser(String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            return java.util.Collections.emptyList();
        }
        ResourceMeta meta = registry.resolve(ORG_USER_POSITIONS);
        Map<String, String[]> params = new java.util.LinkedHashMap<>();
        params.put("userId", new String[]{userId});
        return mapper.selectList(assembler.buildList(meta, params)).stream()
                .map(row -> codec.toApiRow(meta, row))
                .filter(row -> "ENABLED".equalsIgnoreCase(text(row.get("status"))))
                .collect(Collectors.toList());
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
            // 停用的角色立即失效：否则「禁用角色」只改一个标记，权限照旧生效
            if (!"ENABLED".equalsIgnoreCase(text(role.get("status")))) {
                continue;
            }
            permissions.addAll(asStringList(role.get("permissions")));
        }
        return permissions;
    }

    /** 数据范围 = 启用角色 dataScope 的最宽松值（ALL > COMPANY > DEPT > DEPT_ONLY > SELF） */
    @Transactional(readOnly = true)
    public String dataScopeOf(Map<String, Object> user) {
        List<String> roleIds = asStringList(user.get("roleIds"));
        if (roleIds.isEmpty()) {
            return "ALL";
        }
        ResourceMeta roleMeta = registry.resolve(ORG_ROLES);
        QuerySpec spec = new QuerySpec(roleMeta).in(roleMeta.getPkField(), roleIds);
        List<Map<String, Object>> roles = mapper.selectList(spec.toParams(roleMeta.getAllColumns(), null, null)).stream()
                .map(row -> codec.toApiRow(roleMeta, row))
                .collect(Collectors.toList());
        int widest = -1;
        String result = "ALL";
        for (Map<String, Object> role : roles) {
            // 与权限并集同口径：停用角色不参与数据范围判定
            if (!"ENABLED".equalsIgnoreCase(text(role.get("status")))) {
                continue;
            }
            String scope = text(role.get("dataScope"));
            int rank = scopeRank(scope);
            if (rank > widest) {
                widest = rank;
                result = scope;
            }
        }
        return widest < 0 ? "ALL" : result;
    }

    private static int scopeRank(String scope) {
        if ("ALL".equalsIgnoreCase(scope)) {
            return 4;
        }
        if ("COMPANY".equalsIgnoreCase(scope)) {
            return 3;
        }
        if ("DEPT".equalsIgnoreCase(scope)) {
            return 2;
        }
        if ("DEPT_ONLY".equalsIgnoreCase(scope)) {
            return 1;
        }
        if ("SELF".equalsIgnoreCase(scope)) {
            return 0;
        }
        return -1;
    }

    /** 受数据范围约束的业务集合（组织/系统/字典等全局数据不在此列） */
    private static final List<String> DATA_SCOPED_PREFIXES = Arrays.asList(
            "fixed-assets",
            "fixed-asset-doc-lists",
            "low-value-items",
            "low-value-inbound",
            "low-value-requisition",
            "low-value-return");

    /**
     * 按当前登录人的 dataScope 强制追加过滤条件。
     *
     * <p>同名字段由服务端覆盖，调用方无法通过 query 参数绕过。
     * 审计字段不在契约 fields 中，必须用 {@code getAllColumns()} 判断列是否存在。
     * DEPT 按 deptId 精确匹配（系统为单公司、部门树两层以内），即「看本部门全部」；
     * DEPT_ONLY 是「只看本人」：固定资产台账按使用人 userId、各类单据按经办人 creatorId，
     * 低值物品台账没有归属列，作为主数据保持全局可见（否则个人连领用物品都选不到）。</p>
     *
     * <p>例外见 {@link #approverNeedsUnscopedDocs}：DEPT_ONLY 的审批人必须能看到
     * 别人提交、但当前环节点名到本人的待审单据。</p>
     */
    /**
     * 委托统一断言：list / page / listInternal 三个读入口共用同一套规则，
     * 不再是一份只挂在列表上的私有实现；get 与全部写路径另由 {@link #scopeGuard} 直接校验。
     */
    private Map<String, String[]> scopedRaw(String key, ResourceMeta meta, Map<String, String[]> raw) {
        // 公司视角标记只由 GenericController 对外查询入口注入；内部服务调用不带该键，
        // 因此折旧计提、导入索引、数据重置等系统动作不会被顶栏展示视角影响。
        return scopeGuard.scopeRaw(key, meta, raw, extractCompanyView(raw));
    }

    /** 顶栏公司视角的保留参数名（不作为契约字段解析，取用后立即从 query 中移除） */
    public static final String COMPANY_VIEW_PARAM = "__companyView";

    private static String extractCompanyView(Map<String, String[]> raw) {
        if (raw == null || !raw.containsKey(COMPANY_VIEW_PARAM)) {
            return "";
        }
        String[] values = raw.remove(COMPANY_VIEW_PARAM);
        if (values == null || values.length == 0 || values[0] == null) {
            return "";
        }
        return values[0].trim();
    }

    /**
     * 审批人待办可见性：DEPT_ONLY 按 creatorId 只看本人，会漏掉「别人提交、当前环节点名到本人」
     * 的待审单据。WF5「新使用人接收确认」的审批人是 R3 使用人（DEPT_ONLY），若不放行，
     * 工作台待办恒空、业务页签 0 条，审批链会卡在中间没人能点。
     *
     * <p>审批动作本身由 ApprovalService.requireApprover 按流程点名到人复核，
     * 列表可见不等于可审批；写 / 删仍由 PermissionPolicy + AssetOwnerPolicy 控制。</p>
     */
    public static boolean approverNeedsUnscopedDocs(UserPrincipal principal, String key) {
        return principal != null
                && "DEPT_ONLY".equalsIgnoreCase(principal.getDataScope())
                && key != null && key.startsWith("fixed-asset-doc-lists-")
                && principal.getAuthorities().stream().anyMatch(a -> "wm:todo".equals(a.getAuthority()));
    }

    private static boolean isDataScoped(String key) {
        if (key == null) {
            return false;
        }
        for (String prefix : DATA_SCOPED_PREFIXES) {
            if (key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isAllScope(String scope) {
        return scope == null || scope.isEmpty() || "ALL".equalsIgnoreCase(scope);
    }

    private static void putScopeFilter(Map<String, String[]> out, ResourceMeta meta, String field, String value) {
        if (value == null || value.isEmpty()) {
            return;
        }
        // 集合没有对应列时不做过滤：退化为 createBy 会把「部门可见」误收紧为「只看自己创建」，
        // 审批人因此看不到待办单据（P3-14 回归暴露）。
        if (meta.getAllColumns().contains(field)) {
            out.put(field, new String[]{value});
        }
    }

    /** 统计持有指定角色的启用用户数（审批环节「会签」判定用） */
    @Transactional(readOnly = true)
    public long countUsersOfRole(String roleId) {
        return userIdsOfRole(roleId).size();
    }

    /** 持有指定角色的启用用户 ID 列表（加签/转办后的环节审批人集合判定用） */
    @Transactional(readOnly = true)
    public List<String> userIdsOfRole(String roleId) {
        return userIdsOfRole(roleId, null);
    }

    /**
     * D2：按单据归属公司过滤角色审批人池。
     *
     * <p>{@code docCompanyId} 非空时，只返回「所属公司可见该单据公司」的用户，
     * 避免 A 公司仓管出现在 B 公司审批人池。空值沿用当前登录人可见范围（D1 行为）。</p>
     */
    @Transactional(readOnly = true)
    public List<String> userIdsOfRole(String roleId, String docCompanyId) {
        List<String> ids = new ArrayList<>();
        if (roleId == null || roleId.trim().isEmpty()) {
            return ids;
        }
        ResourceMeta meta = registry.resolve(ORG_USERS);
        for (Map<String, Object> row : mapper.selectList(
                assembler.buildList(meta, Collections.emptyMap()))) {
            Map<String, Object> api = codec.toApiRow(meta, row);
            if (!"ENABLED".equals(text(api.get("status")))) {
                continue;
            }
            if (docCompanyId != null && !docCompanyId.trim().isEmpty()) {
                // 单据公司维度：用户自身公司必须在单据公司的可见集合内（本公司+下级+授权），
                // 或用户显式授权公司包含单据公司；全集团账号不受限。
                if (!scopeGuard.isUserCompanyEligible(api, docCompanyId, dataScopeOf(api))) {
                    continue;
                }
            } else if (!scopeGuard.isCompanyVisible(api.get("companyId"))) {
                continue;
            }
            if (asStringList(api.get("roleIds")).contains(roleId)) {
                ids.add(text(api.get("id")));
            }
        }
        // 一人多岗：叠加「在单据归属公司担任该角色岗位」的用户。
        // 主职账号（org-users.roleIds）可能不含该角色，但其在目标公司的兼职岗位持有，
        // 领导干部跨公司兼任即可在该公司审批；无单据公司维度时不叠加，避免把兼职角色全局放大。
        if (docCompanyId != null && !docCompanyId.trim().isEmpty()) {
            for (Map<String, Object> pos : allActivePositions()) {
                if (!asStringList(pos.get("roleIds")).contains(roleId)) {
                    continue;
                }
                String posCompany = text(pos.get("companyId"));
                if (posCompany.isEmpty() || !scopeGuard.isCompanyCovered(posCompany, docCompanyId)) {
                    continue;
                }
                String uid = text(pos.get("userId"));
                if (uid.isEmpty() || ids.contains(uid) || !isUserEnabled(uid)) {
                    continue;
                }
                ids.add(uid);
            }
        }
        return ids;
    }

    /** 指定用户是否持有某角色（审批权限判定用）：主职角色 或 任一启用岗位角色 */
    @Transactional(readOnly = true)
    public boolean userHasRole(String userId, String roleId) {
        if (userId == null || userId.trim().isEmpty() || roleId == null || roleId.trim().isEmpty()) {
            return false;
        }
        Map<String, Object> user = get(ORG_USERS, userId);
        if (user != null && asStringList(user.get("roleIds")).contains(roleId)) {
            return true;
        }
        for (Map<String, Object> pos : positionsOfUser(userId)) {
            if (asStringList(pos.get("roleIds")).contains(roleId)) {
                return true;
            }
        }
        return false;
    }

    /** 全部启用岗位（不经行级范围过滤，内部权限判定用） */
    private List<Map<String, Object>> allActivePositions() {
        ResourceMeta meta = registry.resolve(ORG_USER_POSITIONS);
        return mapper.selectList(assembler.buildList(meta, Collections.emptyMap())).stream()
                .map(row -> codec.toApiRow(meta, row))
                .filter(row -> "ENABLED".equalsIgnoreCase(text(row.get("status"))))
                .collect(Collectors.toList());
    }

    private boolean isUserEnabled(String userId) {
        Map<String, Object> user = get(ORG_USERS, userId);
        return user != null && "ENABLED".equalsIgnoreCase(text(user.get("status")));
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
        scopeGuard.assertWriteField(key, field, value);
        List<Map<String, Object>> targets = mapper.selectList(params);
        if (targets != null && !targets.isEmpty()) {
            scopeGuard.assertRead(key, codec.toApiRow(meta, targets.get(0)));
        }
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

    /**
     * 生成「{前缀}{年份}{三位序号}」：取表内同前缀的最大序号 + 1。
     *
     * <p>排序/前缀判断都基于全表，不受数据范围过滤影响，因此不会与别的部门的单号重复。</p>
     */
    private String nextDocNo(ResourceMeta meta, String prefix) {
        return nextDocNoWithHead(meta, prefix + java.time.Year.now().getValue(), "doc_no");
    }

    /** 单号按「前缀 + 当日日期 + 序号」生成（盘点单：PD20261104001） */
    private String nextDocNoByDate(ResourceMeta meta, String prefix) {
        String ymd = java.time.LocalDate.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        return nextDocNoWithHead(meta, prefix + ymd, "doc_no");
    }

    /** 单号按「前缀 + 年份 + 序号」生成（盘点计划：PD-2026-001） */
    private String nextDocNoByYearDash(ResourceMeta meta, String prefix) {
        return nextDocNoWithHead(meta, prefix + java.time.Year.now().getValue() + "-", "plan_no");
    }

    /**
     * 生成「{head}{三位序号}」：取表内同前缀的最大序号 + 1。
     *
     * <p>排序/前缀判断都基于全表，不受数据范围过滤影响，因此不会与别的部门的单号重复。</p>
     *
     * @param noColumn 单号所在列（低值/盘点单是 doc_no，盘点计划是 plan_no）
     */
    private String nextDocNoWithHead(ResourceMeta meta, String head, String noColumn) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), 50L, null);
        params.put("orderBy", "`" + noColumn + "` DESC");
        long max = 0;
        for (Map<String, Object> row : mapper.selectList(params)) {
            String no = text(row.get(noColumn));
            if (no == null || !no.startsWith(head)) {
                continue;
            }
            String tail = no.substring(head.length());
            if (!tail.matches("\\d+")) {
                continue;
            }
            max = Math.max(max, Long.parseLong(tail));
        }
        return head + String.format("%03d", max + 1);
    }

    /**
     * 固资 8 类单据编号的服务端兜底。
     *
     * <p>前端 {@code genDocNo} 按「当前可见列表」推算编号，而列表受数据范围过滤、
     * 分页与筛选影响（D1 收紧范围后尤其明显），可能算出库中已存在的编号并触发
     * unique 冲突。这里在唯一性校验前按<b>全表</b>同前缀的最大序号 +1 重写编号，
     * 与低值/盘点单「服务端生成单号」的既有口径一致；非标准编号不改写，
     * 仍由唯一性校验报错，避免掩盖真实的数据问题。</p>
     */
    private void ensureUniqueFixedDocCode(String key, ResourceMeta meta, Map<String, Object> row) {
        if (key == null || !key.startsWith("fixed-asset-doc-lists-")
                || !meta.isKnownField("code")) {
            return;
        }
        String code = text(row.get("code"));
        Matcher matcher = FIXED_DOC_CODE.matcher(code);
        if (!matcher.matches()) {
            return;
        }
        Map<String, Object> exists = new QuerySpec(meta).eq("code", code)
                .toParams(meta.getAllColumns(), null, null);
        if (mapper.count(exists) == 0) {
            return;
        }
        String head = matcher.group(1) + matcher.group(2);
        List<String> allCodes = new ArrayList<>();
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), 2000L, 0L);
        params.put("orderBy", "`code` DESC");
        for (Map<String, Object> existing : mapper.selectList(params)) {
            allCodes.add(text(existing.get("code")));
        }
        String next = nextFixedDocCode(head, allCodes);
        row.put("code", next);
        log.info("[doc-code] {} 编号 {} 已存在，按全表重新生成为 {}", key, code, next);
    }

    /** 按同前缀全表最大序号 +1 生成；序号从 1000 起，保持 FP20261000 这类既有格式 */
    static String nextFixedDocCode(String head, List<String> codes) {
        long max = 999L;
        for (String code : codes) {
            if (code == null || !code.startsWith(head)) {
                continue;
            }
            String tail = code.substring(head.length());
            if (tail.matches("\\d+")) {
                max = Math.max(max, Long.parseLong(tail));
            }
        }
        return head + String.format("%04d", max + 1);
    }

    /**
     * 用户编号全表自增：取所有 YH- 前缀的最大 4 位序号 +1。
     *
     * <p>按全表扫描而非数据范围，避免不同公司生成重复编号；序号从 0001 起。</p>
     */
    private String nextUserNo(ResourceMeta meta) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), 5000L, 0L);
        long max = 0L;
        for (Map<String, Object> existing : mapper.selectList(params)) {
            // mapper 返回的 Map key 是数据库列名（user_no），不是驼峰字段名
            String no = text(existing.get("user_no"));
            if (!no.startsWith("YH-")) {
                continue;
            }
            String tail = no.substring(3);
            if (tail.matches("\\d+")) {
                max = Math.max(max, Long.parseLong(tail));
            }
        }
        return String.format("YH-%04d", max + 1);
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
        // 已生效单据不允许改数量：状态未变时同样要守，否则同状态 PUT 可绕过
        if (stock.getSettleOn() != null && stock.getSettleOn().equals(oldStatus)
                && !sameQuantity(next, previous, stock.getQtyField())) {
            throw new ApiException(ErrorCode.CONFLICT, "单据已生效，不能修改数量");
        }
        if (oldStatus.equals(newStatus)) {
            return;
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
        } else if (stock.getReleaseOn() != null && stock.getReleaseOn().contains(newStatus)
                && stock.getReserveOn() != null && stock.getReserveOn().equals(oldStatus)) {
            // 只有「离开审批中」才释放一次预占：被驳回的单据已释放过，
            // 再作废（REJECTED→REVOKED）或草稿直接作废（DRAFT→REVOKED）不能重复扣减，
            // 否则会吃掉同一物品上其他审批中单据的占用量，造成超领。
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
        BigDecimal delta = qty.multiply(BigDecimal.valueOf(sign));
        BigDecimal next = current.add(delta);
        if (next.compareTo(ZERO) < 0) {
            throw new ApiException(ErrorCode.STOCK_INSUFFICIENT, "库存不足，当前可用 " + current.stripTrailingZeros().toPlainString());
        }
        // D3：原子条件扣减（col = col + delta 且结果 >= 0），affected=0 视为并发下库存不足
        int affected = updateColumnDelta(itemMeta, itemId, stock.getStockField(), delta, ZERO);
        if (affected == 0) {
            throw new ApiException(ErrorCode.STOCK_INSUFFICIENT, "库存不足（并发变更），请重试");
        }
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

    /**
     * D3 库存原子扣减：{@code SET col = col + delta WHERE pk=id AND col+delta >= floor}，
     * 返回受影响行数。0 表示下界不满足（库存不足）或行不存在。
     */
    private int updateColumnDelta(ResourceMeta meta, Object id, String field, BigDecimal delta, BigDecimal floor) {
        Map<String, Object> params = new QuerySpec(meta).toParams(meta.getAllColumns(), null, null);
        params.put("id", id);
        params.put("column", field);
        params.put("delta", delta);
        params.put("floor", floor == null ? ZERO : floor);
        return mapper.updateColumnConditional(params);
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
