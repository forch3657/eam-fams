package com.fams.security;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 密码策略（部门规范）：复杂度要求 + 定期修改。
 *
 * <ul>
 *   <li>长度不少于 {@code fams.security.password-min-length}（默认 8）；</li>
 *   <li>至少包含「小写字母 / 大写字母 / 数字 / 符号」中的两类；</li>
 *   <li>不得与账号相同。</li>
 * </ul>
 * 定期修改由 {@code fams.security.password-max-age-days} 控制：
 * 登录时距 {@code passwordResetAt} 超过该天数，仅记录告警（不阻断登录，避免运维事故）。
 */
@Component
public class PasswordPolicy {

    private final int minLength;

    private final long maxAgeDays;

    public PasswordPolicy(@Value("${fams.security.password-min-length:8}") int minLength,
                          @Value("${fams.security.password-max-age-days:90}") long maxAgeDays) {
        this.minLength = minLength;
        this.maxAgeDays = maxAgeDays;
    }

    public void validate(String raw, String username) {
        if (raw == null || raw.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "请设置密码（至少 " + minLength + " 位，含字母/数字/符号中至少两类）");
        }
        if (raw.length() < minLength) {
            throw new ApiException(ErrorCode.VALIDATION, "密码长度至少 " + minLength + " 位");
        }
        int kinds = 0;
        if (raw.chars().anyMatch(Character::isLowerCase)) kinds++;
        if (raw.chars().anyMatch(Character::isUpperCase)) kinds++;
        if (raw.chars().anyMatch(Character::isDigit)) kinds++;
        if (raw.chars().anyMatch(c -> !Character.isLetterOrDigit(c))) kinds++;
        if (kinds < 2) {
            throw new ApiException(ErrorCode.VALIDATION, "密码需包含字母、数字或符号中的至少两类");
        }
        if (username != null && raw.equalsIgnoreCase(username)) {
            throw new ApiException(ErrorCode.VALIDATION, "密码不能与用户名相同");
        }
    }

    /** 密码是否已超期（用于提示，不阻断登录） */
    public boolean isExpired(Object passwordResetAt) {
        if (passwordResetAt == null) {
            return false;
        }
        java.time.LocalDateTime reset = com.fams.engine.DateTimes.parse(passwordResetAt);
        return reset != null && reset.plusDays(maxAgeDays).isBefore(java.time.LocalDateTime.now());
    }
}
