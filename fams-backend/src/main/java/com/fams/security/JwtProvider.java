package com.fams.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;

/**
 * JWT 签发与校验（部门规范：Spring Security + JWT）。
 */
@Component
public class JwtProvider {

    private final Key key;

    private final long expireMillis;

    public JwtProvider(@Value("${fams.security.jwt-secret}") String secret,
                       @Value("${fams.security.jwt-expire-minutes:30}") long expireMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireMillis = expireMinutes * 60L * 1000L;
    }

    public String generate(String username) {
        Date now = new Date();
        return Jwts.builder()
                .setSubject(username)
                // jti：同一秒内重复登录必须生成不同 token，否则登出黑名单会把他人同秒 token 一起作废
                .setId(java.util.UUID.randomUUID().toString())
                .setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + expireMillis))
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    /** 解析 token 得到账号；无效时抛出运行时异常，由调用方统一转换为 401 */
    public String parse(String token) {
        return claimsOf(token).getSubject();
    }

    /**
     * token 的过期时间戳（毫秒）。登出时据此把 token 放入黑名单，
     * 到期后黑名单条目自然失效，不会超过 token 自身的生命周期累积。
     * 无效 token 返回 0。
     */
    public long expirationMillis(String token) {
        try {
            java.util.Date exp = claimsOf(token).getExpiration();
            return exp == null ? 0L : exp.getTime();
        } catch (Exception e) {
            return 0L;
        }
    }

    private Claims claimsOf(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(key)
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    public boolean validate(String token) {
        try {
            parse(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
