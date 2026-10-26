package com.fams.common;

import lombok.Getter;

import java.util.List;
import java.util.Map;

/**
 * 业务异常：携带契约错误码与可选字段级明细。
 */
@Getter
public class ApiException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int code;

    private final List<Map<String, String>> details;

    public ApiException(ErrorCode errorCode) {
        this(errorCode, errorCode.getMessage(), null);
    }

    public ApiException(ErrorCode errorCode, String message) {
        this(errorCode, message, null);
    }

    public ApiException(ErrorCode errorCode, String message, List<Map<String, String>> details) {
        super(message);
        this.code = errorCode.getCode();
        this.details = details;
    }
}
