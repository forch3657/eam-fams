package com.fams.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 统一响应信封（契约 1.1）：{ code, message, data }。
 *
 * <p>code = 0 表示成功；非 0 表示失败。details 仅在 422 字段级校验失败时出现，
 * 为空时不输出到 JSON，避免污染信封结构。</p>
 *
 * @param <T> data 的业务类型
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class R<T> implements Serializable {

    private static final long serialVersionUID = 1L;

    private int code;

    private String message;

    private T data;

    /** 字段级错误明细，仅 422 使用：[{ field, message }] */
    private List<Map<String, String>> details;

    public static <T> R<T> ok(T data) {
        R<T> r = new R<>();
        r.setCode(ErrorCode.OK.getCode());
        r.setMessage(ErrorCode.OK.getMessage());
        r.setData(data);
        return r;
    }

    public static <T> R<T> fail(ErrorCode errorCode) {
        return fail(errorCode, errorCode.getMessage());
    }

    public static <T> R<T> fail(ErrorCode errorCode, String message) {
        R<T> r = new R<>();
        r.setCode(errorCode.getCode());
        r.setMessage(message);
        return r;
    }

    public static <T> R<T> fail(ErrorCode errorCode, String message, List<Map<String, String>> details) {
        R<T> r = fail(errorCode, message);
        r.setDetails(details);
        return r;
    }
}
