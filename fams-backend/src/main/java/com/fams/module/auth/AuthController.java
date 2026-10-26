package com.fams.module.auth;

import com.fams.common.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(authService.login(request.getUsername(), request.getPassword()));
    }

    /** 无状态会话：服务端无需清理，前端丢弃 token 即完成登出 */
    @PostMapping("/logout")
    public R<Boolean> logout() {
        return R.ok(true);
    }

    @GetMapping("/profile")
    public R<Map<String, Object>> profile() {
        return R.ok(authService.profile());
    }
}
