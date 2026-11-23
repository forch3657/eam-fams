package com.fams.module.liuxun;

import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * 柳讯用户 → 本地 org-users 映射与自动建号。
 *
 * <p>映射口径（已确认）：柳讯 userName（手机号）= 本地 username。
 * 命中既有账号直接复用其角色/岗位；不存在则按配置默认角色/岗位/公司自动创建。
 * 暂不持久化 liuxunId：避免改 schema/元数据契约，待办 userIds 通过
 * GET /api/user/query 按手机号实时查得。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiuxunUserService {

    private static final String ORG_USERS = "org-users";
    private static final String ORG_ROLES = "org-roles";
    private static final String ORG_USER_POSITIONS = "org-user-positions";

    private final GenericService genericService;
    private final LiuxunProperties properties;

    /**
     * 按柳讯账号解析本地用户，不存在则自动建号。
     * 返回本地 org-users 原始行（含 password 字段，调用方需自行脱敏后返回前端）。
     */
    @Transactional
    public Map<String, Object> resolveOrCreate(LiuxunAccount account) {
        if (account == null) {
            throw new IllegalArgumentException("柳讯账号信息为空");
        }
        String phone = firstNonBlank(account.getUserName(), account.getTelephone());
        if (phone.isEmpty()) {
            throw new IllegalArgumentException("柳讯账号缺少手机号，无法映射本地用户");
        }

        Map<String, Object> existing = genericService.findByUsername(phone);
        if (existing != null) {
            String status = String.valueOf(existing.getOrDefault("status", ""));
            if (!"ENABLED".equalsIgnoreCase(status)) {
                throw new IllegalStateException("本地账号已停用，请联系管理员：" + phone);
            }
            log.info("[liuxun] 命中既有本地账号 {}", phone);
            return existing;
        }

        List<String> roleIds = resolveRoleIds();
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("username", phone);
        user.put("name", firstNonBlank(account.getRealName(), phone));
        user.put("phone", phone);
        user.put("email", nullToEmpty(account.getEmail()));
        user.put("companyId", properties.getDefaultCompanyId());
        user.put("deptId", properties.getDefaultDeptId());
        user.put("roleIds", roleIds);
        user.put("position", properties.getDefaultPosition());
        // 本地密码不走柳讯：自动生成随机口令，仅占位（BCrypt 由 GenericService.create 完成）
        user.put("password", UUID.randomUUID().toString().replace("-", "") + "Aa1!");
        user.put("status", "ENABLED");

        Map<String, Object> created = genericService.create(ORG_USERS, user);
        createPrimaryPosition(String.valueOf(created.get("id")), roleIds);
        log.info("[liuxun] 自动建号成功：{}（角色={} 岗位={} 公司={}）",
                phone, properties.getDefaultRoleCode(), properties.getDefaultPosition(), properties.getDefaultCompanyId());
        return created;
    }

    /** 取用户主职岗位 id，用于签发带 pos claim 的自有 JWT */
    public String primaryPositionIdOf(String userId) {
        for (Map<String, Object> pos : genericService.positionsOfUser(userId)) {
            if (com.fams.engine.RowCodec.toBoolean(pos.get("isPrimary")) == Boolean.TRUE) {
                return String.valueOf(pos.getOrDefault("id", ""));
            }
        }
        return "";
    }

    /** 对外返回的用户快照：去密码 */
    public Map<String, Object> sanitize(Map<String, Object> user) {
        Map<String, Object> safe = new LinkedHashMap<>(user);
        safe.remove("password");
        safe.remove("passwordResetAt");
        return safe;
    }

    private void createPrimaryPosition(String userId, List<String> roleIds) {
        Map<String, Object> pos = new LinkedHashMap<>();
        pos.put("userId", userId);
        pos.put("companyId", properties.getDefaultCompanyId());
        pos.put("deptId", properties.getDefaultDeptId());
        pos.put("position", properties.getDefaultPosition());
        pos.put("roleIds", roleIds);
        pos.put("isPrimary", true);
        pos.put("status", "ENABLED");
        try {
            genericService.create(ORG_USER_POSITIONS, pos);
        } catch (RuntimeException e) {
            // 岗位子表创建失败不回滚建号，但要告警：用户可能只能按主用户 roleIds 鉴权
            log.warn("[liuxun] 自动建号后创建主岗位失败 userId={}：{}", userId, e.getMessage());
        }
    }

    /** 按 code 解析默认角色 ID；找不到时返回空列表（用户仍可建号，但无权限） */
    private List<String> resolveRoleIds() {
        String code = properties.getDefaultRoleCode();
        if (code == null || code.trim().isEmpty()) {
            return Collections.emptyList();
        }
        for (Map<String, Object> role : genericService.list(ORG_ROLES, new HashMap<>())) {
            String roleCode = String.valueOf(role.getOrDefault("code", ""));
            if (code.equalsIgnoreCase(roleCode)) {
                return Collections.singletonList(String.valueOf(role.get("id")));
            }
        }
        log.warn("[liuxun] 默认角色编码 {} 未找到，新用户将无角色", code);
        return Collections.emptyList();
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return "";
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
