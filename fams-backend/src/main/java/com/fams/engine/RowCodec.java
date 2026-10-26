package com.fams.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.ResourceMeta;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 行编解码：契约字段（camelCase）与物理列（snake_case）之间的转换。
 *
 * <p>数组/对象字段以 JSON 文本存储，读取时反序列化回 List/Map。
 * 未在契约里声明的字段一律丢弃，避免脏字段进入 SQL。</p>
 */
@Slf4j
@Component
public class RowCodec {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    /** DB 行 → API 行：列名转回契约字段名，JSON 文本还原为对象 */
    public Map<String, Object> toApiRow(ResourceMeta meta, Map<String, Object> dbRow) {
        if (dbRow == null) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        Set<String> arrays = meta.arrayFields();
        for (Map.Entry<String, Object> entry : dbRow.entrySet()) {
            Object value = entry.getValue();
            if (value == null) {
                continue;
            }
            String field = Names.snakeToCamel(entry.getKey());
            if (arrays.contains(field) && value instanceof String) {
                value = readJson(value.toString(), field);
            }
            out.put(field, value);
        }
        return out;
    }

    /**
     * API 行 → DB 列值：只保留契约声明的列，按类型编码。
     *
     * @param fullReplace true 时 body 缺失的字段填 null（PUT 全量替换语义）
     */
    public Map<String, Object> toDbRow(ResourceMeta meta, Map<String, Object> apiRow, boolean fullReplace) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String column : meta.getAllColumns()) {
            if (ResourceMeta.AUDIT_COLUMNS.contains(column)) {
                continue;
            }
            if (apiRow == null || !apiRow.containsKey(column)) {
                if (fullReplace) {
                    out.put(column, null);
                }
                continue;
            }
            out.put(column, encodeValue(meta, column, apiRow.get(column)));
        }
        return out;
    }

    /** 单个值按契约类型编码 */
    public static Object encodeValue(ResourceMeta meta, String field, Object value) {
        if (value == null) {
            return null;
        }
        String type = meta.field(field).map(ResourceMeta.Field::getType).orElse("string");
        switch (type) {
            case "number":
                return toBigDecimal(value);
            case "boolean":
                return toBoolean(value);
            case "date":
                return DateTimes.parse(value);
            case "array":
            case "object":
                return writeJson(value);
            default:
                return value instanceof String ? value : String.valueOf(value);
        }
    }

    public static BigDecimal toBigDecimal(Object value) {
        if (value instanceof BigDecimal) {
            return (BigDecimal) value;
        }
        if (value instanceof Number) {
            return BigDecimal.valueOf(((Number) value).doubleValue());
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            throw new ApiException(ErrorCode.VALIDATION, "字段值应为数值：" + text);
        }
    }

    public static Boolean toBoolean(Object value) {
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        String text = String.valueOf(value).trim();
        return "true".equalsIgnoreCase(text) || "1".equals(text) || "yes".equalsIgnoreCase(text);
    }

    /** JSON 文本 → 对象；解析失败返回空数组，避免脏数据让整行读取失败 */
    public static Object parseJsonSafe(String text) {
        if (text == null || text.trim().isEmpty()) {
            return new java.util.ArrayList<>();
        }
        try {
            return MAPPER.readValue(text, Object.class);
        } catch (Exception e) {
            log.warn("JSON 文本解析失败，按空数组处理：{}", text);
            return new java.util.ArrayList<>();
        }
    }

    @SuppressWarnings("unchecked")
    private Object readJson(String text, String field) {
        try {
            return MAPPER.readValue(text, Object.class);
        } catch (Exception e) {
            log.warn("字段 {} 的 JSON 文本解析失败，按空数组处理", field);
            return new java.util.ArrayList<>();
        }
    }

    public static String writeJson(Object value) {
        if (value instanceof String) {
            return (String) value;
        }
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new ApiException(ErrorCode.VALIDATION, "字段值无法序列化为 JSON");
        }
    }

    /** 规范化：把查询/写入值统一为可比较形式（数组按 JSON 文本比较） */
    public static Object normalize(Object value) {
        if (value instanceof List || value instanceof Map) {
            return writeJson(value);
        }
        return value;
    }
}
