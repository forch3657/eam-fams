package com.fams.module.auth;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.JwtProvider;
import com.fams.security.LoginAttemptService;
import com.fams.security.PasswordPolicy;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 认证服务。
 *
 * <p>安全要求（部门规范）：
 * <ul>
 *   <li>登录失败提示统一为「用户名或密码错误」，不区分账号不存在与密码错误；</li>
 *   <li>连续失败达到阈值后锁定账号；</li>
 *   <li>日志不输出密码与 token 原文。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String ORG_USERS = "org-users";

    private final GenericService genericService;

    private final PasswordEncoder passwordEncoder;

    private final JwtProvider jwtProvider;

    private final LoginAttemptService loginAttemptService;

    private final PasswordPolicy passwordPolicy;

    /**
     * 登录校验必须在认证之前进行：先判断锁定，再校验密码，
     * 且失败提示不泄露账号是否存在。
     */
    @Transactional
    public LoginResponse login(String username, String rawPassword) {
        if (username != null && loginAttemptService.isLocked(username)) {
            throw new ApiException(ErrorCode.FORBIDDEN,
                    "账号已锁定，请 " + loginAttemptService.remainingLockMinutes(username) + " 分钟后重试");
        }
        Map<String, Object> user = genericService.findByUsername(username);
        String stored = user == null ? null : String.valueOf(user.getOrDefault("password", ""));
        boolean matched = user != null && stored != null && !stored.isEmpty()
                && passwordEncoder.matches(rawPassword == null ? "" : rawPassword, stored);
        if (!matched) {
            loginAttemptService.loginFailed(username);
            throw new ApiException(ErrorCode.UNAUTHORIZED, "用户名或密码错误");
        }
        // 密码正确后再校验账号状态：停用账号不允许登录，也不刷新最后登录时间
        if (!"ENABLED".equalsIgnoreCase(String.valueOf(user.getOrDefault("status", "")))) {
            throw new ApiException(ErrorCode.FORBIDDEN, "账号已停用，请联系管理员");
        }
        loginAttemptService.loginSucceeded(username);
        genericService.touchLastLogin(username);
        // 一人多岗：默认以主职岗位登录；无岗位数据时 positionId 为空，按主表处理
        String primaryPositionId = primaryPositionIdOf(text(user.get("id")));
        Map<String, Object> safe = sanitize(user);
        safe.put("currentPositionId", primaryPositionId);
        safe.put("positions", positionViews(genericService.positionsOfUser(text(user.get("id")))));
        return new LoginResponse(jwtProvider.generate(username, primaryPositionId), safe);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> profile() {
        UserPrincipal principal = AuthContext.current();
        if (principal == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录");
        }
        Map<String, Object> user = genericService.findByUsername(principal.getUsername());
        if (user == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "登录已失效");
        }
        Map<String, Object> safe = sanitize(user);
        safe.put("currentPositionId", principal.getPositionId());
        safe.put("positions", positionViews(genericService.positionsOfUser(text(user.get("id")))));
        // 当前岗位覆盖主表字段：让前端权限/展示与后端同一口径
        if (principal.getPositionId() != null && !principal.getPositionId().isEmpty()) {
            Map<String, Object> pos = genericService.activePositionOf(text(user.get("id")), principal.getPositionId());
            if (pos != null) {
                safe.put("companyId", pos.get("companyId"));
                safe.put("deptId", pos.get("deptId") == null ? "" : pos.get("deptId"));
                safe.put("position", pos.get("position") == null ? "" : pos.get("position"));
                safe.put("roleIds", pos.get("roleIds") == null ? java.util.Collections.emptyList() : pos.get("roleIds"));
            }
        }
        return safe;
    }

    /** 当前用户的全部启用岗位（供顶栏切换器） */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> myPositions() {
        UserPrincipal principal = AuthContext.current();
        if (principal == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录");
        }
        Map<String, Object> user = genericService.findByUsername(principal.getUsername());
        if (user == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "登录已失效");
        }
        List<Map<String, Object>> views = positionViews(genericService.positionsOfUser(text(user.get("id"))));
        return views;
    }

    /**
     * 切换当前岗位：校验岗位属于本人且启用，重签带新岗位 claim 的 token。
     * 旧 token 由调用方（Controller）加入黑名单，避免同时存在两种身份。
     */
    @Transactional(readOnly = true)
    public LoginResponse switchPosition(String positionId) {
        UserPrincipal principal = AuthContext.current();
        if (principal == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "未登录");
        }
        Map<String, Object> user = genericService.findByUsername(principal.getUsername());
        if (user == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "登录已失效");
        }
        String userId = text(user.get("id"));
        Map<String, Object> pos = genericService.activePositionOf(userId, positionId);
        if (pos == null) {
            throw new ApiException(ErrorCode.FORBIDDEN, "岗位不存在、已停用或不属于当前用户");
        }
        Map<String, Object> safe = sanitize(user);
        safe.put("companyId", pos.get("companyId"));
        safe.put("deptId", pos.get("deptId") == null ? "" : pos.get("deptId"));
        safe.put("position", pos.get("position") == null ? "" : pos.get("position"));
        safe.put("roleIds", pos.get("roleIds") == null ? java.util.Collections.emptyList() : pos.get("roleIds"));
        safe.put("currentPositionId", text(pos.get("id")));
        safe.put("positions", positionViews(genericService.positionsOfUser(userId)));
        return new LoginResponse(jwtProvider.generate(principal.getUsername(), text(pos.get("id"))), safe);
    }

    private String primaryPositionIdOf(String userId) {
        for (Map<String, Object> pos : genericService.positionsOfUser(userId)) {
            // isPrimary 从 DB 读出时可能是 TINYINT(1)=1 或 Boolean，统一按 truthy 判定
            if (com.fams.engine.RowCodec.toBoolean(pos.get("isPrimary")) == Boolean.TRUE) {
                return text(pos.get("id"));
            }
        }
        return "";
    }

    /** 岗位视图：补公司/部门名称，供前端下拉直接展示 */
    private List<Map<String, Object>> positionViews(List<Map<String, Object>> positions) {
        List<Map<String, Object>> views = new java.util.ArrayList<>();
        for (Map<String, Object> pos : positions) {
            Map<String, Object> v = new LinkedHashMap<>(pos);
            v.put("companyName", genericService.nameOf("org-companies", text(pos.get("companyId"))));
            v.put("deptName", text(pos.get("deptId")).isEmpty()
                    ? "" : genericService.nameOf("org-departments", text(pos.get("deptId"))));
            views.add(v);
        }
        return views;
    }

    /** 对外返回的用户信息中不得包含密码 */
    private static Map<String, Object> sanitize(Map<String, Object> user) {
        Map<String, Object> safe = new LinkedHashMap<>(user);
        safe.remove("password");
        return safe;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
