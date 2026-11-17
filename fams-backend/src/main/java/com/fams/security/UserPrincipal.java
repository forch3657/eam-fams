package com.fams.security;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 登录主体：持有用户信息与权限码集合（用户权限 = 各角色权限的并集）。
 */
@Getter
public class UserPrincipal implements UserDetails {

    private static final long serialVersionUID = 1L;

    private final String id;

    private final String username;

    private final String name;

    private final String password;

    private final String companyId;

    private final String deptId;

    private final List<String> roleIds;

    /** 数据范围（多角色取最宽松）：ALL / COMPANY / DEPT / DEPT_ONLY / SELF */
    private final String dataScope;

    /** 角色组织范围（GROUP / COMPANY / DEPT），集团化改造后参与范围判定 */
    private final String orgScope;

    /** 显式授权可访问的其它公司（跨公司兼任） */
    private final Set<String> scopeCompanyIds;

    /** 当前生效岗位 id（一人多岗时由登录/切换岗位指定；空表示主职） */
    private String positionId = "";

    private final Set<GrantedAuthority> authorities;

    public UserPrincipal(Map<String, Object> user, Set<String> permissions, String dataScope) {
        this(user, permissions, dataScope, "", Collections.emptySet());
    }

    public UserPrincipal(Map<String, Object> user, Set<String> permissions, String dataScope,
                         String orgScope, Set<String> scopeCompanyIds) {
        this.id = text(user.get("id"));
        this.username = text(user.get("username"));
        this.name = text(user.get("name"));
        this.password = text(user.get("password"));
        this.companyId = text(user.get("companyId"));
        this.deptId = text(user.get("deptId"));
        this.roleIds = asStringList(user.get("roleIds"));
        this.dataScope = dataScope == null || dataScope.isEmpty() ? "ALL" : dataScope;
        this.orgScope = orgScope == null ? "" : orgScope;
        Set<String> grantedCompanies = new LinkedHashSet<>();
        if (scopeCompanyIds != null) {
            for (String id : scopeCompanyIds) {
                if (id != null && !id.trim().isEmpty()) {
                    grantedCompanies.add(id.trim());
                }
            }
        }
        this.scopeCompanyIds = Collections.unmodifiableSet(grantedCompanies);
        Set<GrantedAuthority> granted = new LinkedHashSet<>();
        if (permissions != null) {
            for (String code : permissions) {
                granted.add(new SimpleGrantedAuthority(code));
            }
        }
        this.authorities = Collections.unmodifiableSet(granted);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }

    public void setPositionId(String positionId) {
        this.positionId = positionId == null ? "" : positionId;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static List<String> asStringList(Object value) {
        if (!(value instanceof Iterable)) {
            return Collections.emptyList();
        }
        List<String> out = new java.util.ArrayList<>();
        for (Object item : (Iterable<?>) value) {
            if (item != null) {
                out.add(text(item));
            }
        }
        return out;
    }
}
