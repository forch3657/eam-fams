package com.fams.module.auth;

import com.fams.common.R;
import com.fams.security.JwtAuthFilter;
import com.fams.security.TokenBlacklist;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.validation.Valid;
import java.util.Map;

/**
 * 认证端点（契约 1.3）。
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    private final TokenBlacklist tokenBlacklist;

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(authService.login(request.getUsername(), request.getPassword()));
    }

    /**
     * 登出：把当前 token 放入服务端黑名单，旧 token 再调任意接口返回 401（S-03）。
     * token 通过 Authorization: Bearer 头传入；缺失或格式错误时幂等返回成功，
     * 保证前端「先清本地再通知后端」的顺序下不会误报失败。
     */
    @PostMapping("/logout")
    public R<Boolean> logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization != null && authorization.startsWith(JwtAuthFilter.PREFIX)) {
            tokenBlacklist.revoke(authorization.substring(JwtAuthFilter.PREFIX.length()).trim());
        }
        return R.ok(true);
    }

    @GetMapping("/profile")
    public R<Map<String, Object>> profile() {
        return R.ok(authService.profile());
    }

    /** 当前用户的全部启用岗位（含主职），供顶栏「当前岗位」切换器 */
    @GetMapping("/positions")
    public R<java.util.List<Map<String, Object>>> positions() {
        return R.ok(authService.myPositions());
    }

    /**
     * 切换当前岗位：重签带新岗位 claim 的 token，并把旧 token 加入黑名单，
     * 保证同一时刻只有一种岗位身份有效。
     */
    @PostMapping("/switch-position")
    public R<LoginResponse> switchPosition(@RequestBody Map<String, Object> body,
                                           @RequestHeader(value = "Authorization", required = false) String authorization) {
        String positionId = body == null ? "" : String.valueOf(body.getOrDefault("positionId", ""));
        LoginResponse response = authService.switchPosition(positionId);
        if (authorization != null && authorization.startsWith(JwtAuthFilter.PREFIX)) {
            tokenBlacklist.revoke(authorization.substring(JwtAuthFilter.PREFIX.length()).trim());
        }
        return R.ok(response);
    }
}
