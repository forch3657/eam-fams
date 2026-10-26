package com.fams.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 登录失败锁定（部门规范）：连续失败 N 次锁定 M 分钟。
 *
 * <p>注入 {@link Clock} 以便在测试中做时间旅行；当前实现为进程内缓存，
 * 多实例部署时应改为 Redis 等共享存储（已记录为已知限制）。</p>
 */
@Slf4j
@Service
public class LoginAttemptService {

    private final int maxAttempts;

    private final long lockMillis;

    private final Clock clock;

    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    public LoginAttemptService(@Value("${fams.security.max-failed-attempts:5}") int maxAttempts,
                               @Value("${fams.security.lock-minutes:30}") long lockMinutes,
                               Clock clock) {
        this.maxAttempts = maxAttempts;
        this.lockMillis = lockMinutes * 60L * 1000L;
        this.clock = clock;
    }

    public void loginSucceeded(String username) {
        attempts.remove(username);
    }

    public void loginFailed(String username) {
        Attempt attempt = attempts.computeIfAbsent(username, k -> new Attempt());
        attempt.failures++;
        if (attempt.failures >= maxAttempts) {
            attempt.lockedUntil = clock.millis() + lockMillis;
            log.warn("账号 {} 连续登录失败 {} 次，已锁定", username, attempt.failures);
        }
    }

    public boolean isLocked(String username) {
        Attempt attempt = attempts.get(username);
        if (attempt == null || attempt.lockedUntil == 0L) {
            return false;
        }
        if (clock.millis() >= attempt.lockedUntil) {
            // 锁定已到期，自动解除
            attempts.remove(username);
            return false;
        }
        return true;
    }

    /** 剩余锁定时间（分钟，向上取整） */
    public long remainingLockMinutes(String username) {
        Attempt attempt = attempts.get(username);
        if (attempt == null || attempt.lockedUntil == 0L) {
            return 0L;
        }
        long left = attempt.lockedUntil - clock.millis();
        if (left <= 0) {
            return 0L;
        }
        return (left + 59999L) / 60000L;
    }

    /** 单个账号的失败计数与锁定时点 */
    private static final class Attempt {

        private int failures;

        private long lockedUntil;
    }
}
