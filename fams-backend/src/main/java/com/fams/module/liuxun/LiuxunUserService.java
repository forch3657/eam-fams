package com.fams.module.liuxun;

import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 柳讯用户 → 本地 org-users 映射。
 *
 * <p>映射口径（2026-11-24 确认变更）：柳讯 userName（手机号）= 本地 username。
 * <b>只映射既有本地账号，不自动建号</b>——柳讯 account_info 不含公司/部门，
 * 自动创建只能落到不存在的默认 C1/D1，新用户能登录却什么都看不到；
 * 且会产生无归属的野账号。未预置用户一律拒绝，提示联系管理员在
 * 用户管理里建号并配好公司/部门/角色。</p>
 *
 * <p>暂不持久化 liuxunId：待办 userIds 通过 GET /api/user/query 按手机号实时查得。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiuxunUserService {

    private static final String ORG_USERS = "org-users";

    private final GenericService genericService;

    /**
     * 按柳讯账号解析本地用户。命中既有启用账号返回其原始行（含 password，
     * 调用方需自行脱敏）；未预置或已停用的账号抛出带提示的异常，由 Controller 转成 401。
     */
    public Map<String, Object> resolveExisting(LiuxunAccount account) {
        if (account == null) {
            throw new IllegalArgumentException("柳讯账号信息为空");
        }
        String phone = firstNonBlank(account.getUserName(), account.getTelephone());
        if (phone.isEmpty()) {
            throw new IllegalArgumentException("柳讯账号缺少手机号，无法映射本地用户");
        }

        Map<String, Object> existing = genericService.findByUsername(phone);
        if (existing == null) {
            log.warn("[liuxun] 柳讯账号在本地未预置，拒绝登录：{}", phone);
            throw new IllegalStateException("该柳讯账号尚未开通系统访问权限，请联系管理员在用户管理中预置账号并配置公司/部门/角色：" + phone);
        }
        String status = String.valueOf(existing.getOrDefault("status", ""));
        if (!"ENABLED".equalsIgnoreCase(status)) {
            log.warn("[liuxun] 本地账号已停用，拒绝登录：{}", phone);
            throw new IllegalStateException("本地账号已停用，请联系管理员：" + phone);
        }
        log.info("[liuxun] 命中既有本地账号 {}", phone);
        return existing;
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
        Map<String, Object> safe = new java.util.LinkedHashMap<>(user);
        safe.remove("password");
        safe.remove("passwordResetAt");
        return safe;
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return "";
    }
}
