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
        loginAttemptService.loginSucceeded(username);
        genericService.touchLastLogin(username);
        return new LoginResponse(jwtProvider.generate(username), sanitize(user));
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
        return sanitize(user);
    }

    /** 对外返回的用户信息中不得包含密码 */
    private static Map<String, Object> sanitize(Map<String, Object> user) {
        Map<String, Object> safe = new LinkedHashMap<>(user);
        safe.remove("password");
        return safe;
    }
}
