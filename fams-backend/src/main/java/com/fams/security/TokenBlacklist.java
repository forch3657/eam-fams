package com.fams.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 登出 token 黑名单（S-03）。
 *
 * <p>无状态 JWT 本身不能主动失效，登出时把 token 原文记入黑名单，
 * 有效期取 token 自身的过期时间（最长不超过配置的 access token 时长）。
 * {@link JwtAuthFilter} 每次解析前先查黑名单，命中即按未登录处理（401）。</p>
 *
 * <p>本系统当前为单实例部署，内存黑名单足够；多实例水平扩展时改为 Redis
 * 共享黑名单即可，接口不变（D3 会话外置一并处理）。</p>
 */
@Slf4j
@Component
public class TokenBlacklist {

    private final Map<String, Long> revoked = new ConcurrentHashMap<>();

    private final JwtProvider jwtProvider;

    public TokenBlacklist(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    /** 撤销一个 token；过期时间取 JWT 的 exp，已过期的无需登记 */
    public void revoke(String token) {
        if (token == null || token.isEmpty()) {
            return;
        }
        long expiresAt = jwtProvider.expirationMillis(token);
        if (expiresAt <= System.currentTimeMillis()) {
            return;
        }
        purge();
        revoked.put(token, expiresAt);
        log.info("[auth] token 已撤销，剩余有效期 {} 分钟", (expiresAt - System.currentTimeMillis()) / 60000);
    }

    /** 是否已被撤销；顺带清理已自然过期的条目，避免内存无界增长 */
    public boolean isRevoked(String token) {
        if (token == null || token.isEmpty()) {
            return false;
        }
        Long expiresAt = revoked.get(token);
        if (expiresAt == null) {
            return false;
        }
        if (expiresAt <= System.currentTimeMillis()) {
            revoked.remove(token, expiresAt);
            return false;
        }
        return true;
    }

    /** 当前黑名单条目数（健康检查 / 单测用） */
    public int size() {
        purge();
        return revoked.size();
    }

    private void purge() {
        long now = System.currentTimeMillis();
        revoked.entrySet().removeIf(entry -> entry.getValue() <= now);
    }
}
