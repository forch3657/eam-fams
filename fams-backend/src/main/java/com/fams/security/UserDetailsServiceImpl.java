package com.fams.security;

import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
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
        return loadUserByUsername(username, "");
    }

    /**
     * 按「当前岗位」构建登录主体（一人多岗）。
     *
     * <p>positionId 为空或岗位无效（不属于该用户 / 停用）时按用户主职（org-users 主表）处理，
     * 保证存量账号与旧 token 零回归。岗位有效时，用岗位的 companyId/deptId/position/roleIds
     * 覆盖主表字段后再算权限码与数据范围，因此下游所有按 principal 取值的鉴权逻辑自动按当前岗位生效。</p>
     */
    public UserDetails loadUserByUsername(String username, String positionId) throws UsernameNotFoundException {
        Map<String, Object> raw = genericService.findByUsername(username);
        if (raw == null) {
            throw new UsernameNotFoundException("用户不存在");
        }
        // 每次请求都会经 JwtAuthFilter 重载用户；这里校验状态才能让停用即时失效，
        // 抛出的 DisabledException 由过滤器统一按未登录处理（401）。
        if (!"ENABLED".equalsIgnoreCase(String.valueOf(raw.getOrDefault("status", "")))) {
            throw new DisabledException("账号已停用");
        }
        Map<String, Object> user = raw;
        String effectivePositionId = "";
        if (positionId != null && !positionId.trim().isEmpty()) {
            Map<String, Object> pos = genericService.activePositionOf(text(raw.get("id")), positionId.trim());
            if (pos != null) {
                effectivePositionId = text(pos.get("id"));
                user = new LinkedHashMap<>(raw);
                user.put("companyId", pos.get("companyId"));
                user.put("deptId", pos.get("deptId") == null ? "" : pos.get("deptId"));
                user.put("position", pos.get("position") == null ? "" : pos.get("position"));
                user.put("roleIds", pos.get("roleIds") == null ? java.util.Collections.emptyList() : pos.get("roleIds"));
            }
        }
        UserPrincipal principal = new UserPrincipal(user, genericService.permissionsOf(user), genericService.dataScopeOf(user),
                text(raw.get("orgScope")), scopeCompanies(raw.get("scopeCompanyIds")));
        principal.setPositionId(effectivePositionId);
        return principal;
    }

    /** 用户行的数组列可能已是 List，也可能是 JSON 文本（兼容两种来源） */
    private static java.util.Set<String> scopeCompanies(Object raw) {
        java.util.Set<String> ids = new java.util.LinkedHashSet<>();
        if (raw instanceof Iterable) {
            for (Object item : (Iterable<?>) raw) {
                if (item != null && !String.valueOf(item).trim().isEmpty()) {
                    ids.add(String.valueOf(item).trim());
                }
            }
        } else if (raw instanceof String && !((String) raw).trim().isEmpty()) {
            for (String item : ((String) raw).split("[,;\\[\\]\"]+")) {
                if (!item.trim().isEmpty()) {
                    ids.add(item.trim());
                }
            }
        }
        return ids;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
