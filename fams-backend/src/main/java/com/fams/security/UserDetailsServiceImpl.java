package com.fams.security;

import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

/**
 * 登录主体加载：账号 → 用户行 + 权限码并集。
 */
@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final GenericService genericService;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Map<String, Object> user = genericService.findByUsername(username);
        if (user == null) {
            throw new UsernameNotFoundException("用户不存在");
        }
        // 每次请求都会经 JwtAuthFilter 重载用户；这里校验状态才能让停用即时失效，
        // 抛出的 DisabledException 由过滤器统一按未登录处理（401）。
        if (!"ENABLED".equalsIgnoreCase(String.valueOf(user.getOrDefault("status", "")))) {
            throw new DisabledException("账号已停用");
        }
        return new UserPrincipal(user, genericService.permissionsOf(user), genericService.dataScopeOf(user));
    }
}
