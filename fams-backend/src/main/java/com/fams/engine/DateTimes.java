package com.fams.engine;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

/**
 * 时间解析：契约要求一律 ISO 8601，此处宽容解析后再由 Jackson 统一以 ISO 输出。
 */
@Component
public final class DateTimes {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private static final DateTimeFormatter OUT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS");

    private DateTimes() {
    }

    /** 解析入参为 LocalDateTime；无法识别时返回 null（由必填规则给出提示） */
    public static LocalDateTime parse(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDateTime) {
            return (LocalDateTime) value;
        }
        if (value instanceof LocalDate) {
            return ((LocalDate) value).atStartOfDay();
        }
        if (value instanceof java.util.Date) {
            return LocalDateTime.ofInstant(((java.util.Date) value).toInstant(), ZONE);
        }
        if (value instanceof Long) {
            return LocalDateTime.ofInstant(Instant.ofEpochMilli((Long) value), ZONE);
        }
        String text = value.toString().trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text);
        } catch (DateTimeParseException ignored) {
            // 继续尝试其它常见写法
        }
        try {
            return LocalDate.parse(text).atStartOfDay();
        } catch (DateTimeParseException ignored) {
            // 继续
        }
        try {
            return LocalDateTime.ofInstant(Instant.parse(text), ZONE);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("时间格式应为 ISO 8601：" + text);
        }
    }

    public static String format(LocalDateTime time) {
        return time == null ? null : time.format(OUT);
    }
}
