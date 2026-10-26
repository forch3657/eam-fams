package com.fams.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 当前登录上下文：从 SecurityContext 中取登录主体与其权限码。
 */
public final class AuthContext {

    private AuthContext() {
    }

    public static UserPrincipal current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal) {
            return (UserPrincipal) auth.getPrincipal();
        }
        return null;
    }

    /** 当前操作人账号；未登录时为 null（如系统内部调用） */
    public static String currentUsername() {
        UserPrincipal principal = current();
        return principal == null ? null : principal.getUsername();
    }

    public static String currentUserId() {
        UserPrincipal principal = current();
        return principal == null ? null : principal.getId();
    }

    /** 当前登录人持有的权限码集合；未登录时为空集 */
    public static java.util.Set<String> granted() {
        UserPrincipal principal = current();
        if (principal == null) {
            return java.util.Collections.emptySet();
        }
        java.util.Set<String> codes = new java.util.LinkedHashSet<>();
        for (org.springframework.security.core.GrantedAuthority authority : principal.getAuthorities()) {
            codes.add(authority.getAuthority());
        }
        return codes;
    }

    /** 是否持有指定权限码；code 为空视为无需鉴权 */
    public static boolean hasPermission(String code) {
        if (code == null || code.isEmpty()) {
            return true;
        }
        UserPrincipal principal = current();
        if (principal == null) {
            return false;
        }
        return principal.getAuthorities().stream()
                .anyMatch(a -> code.equals(a.getAuthority()));
    }
}
