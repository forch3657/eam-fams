package com.fams.common;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

/**
 * 错误码枚举（契约第 2 节）。
 *
 * <p>与前端 src/services/errors.js 的 ERROR_CODES 一一对应。</p>
 */
@Getter
@AllArgsConstructor
public enum ErrorCode {

    OK(0, "ok"),
    BAD_REQUEST(400, "请求参数有误"),
    UNAUTHORIZED(401, "未登录或登录已失效"),
    FORBIDDEN(403, "无权限"),
    NOT_FOUND(404, "数据不存在"),
    CONFLICT(409, "数据冲突"),
    VALIDATION(422, "数据校验未通过"),
    SERVER(500, "服务异常"),

    STOCK_INSUFFICIENT(1001, "库存不足"),
    HAS_CHILDREN(1002, "存在下级数据，不能删除"),
    HAS_REFERENCE(1003, "该数据已被引用，不能删除"),
    DUPLICATE(1004, "数据重复"),
    REF_NOT_FOUND(1005, "关联数据不存在"),
    EXCEED_RETURNED(1006, "数量超出可退范围");

    private final int code;
    private final String message;

    private static final Map<Integer, ErrorCode> BY_CODE = new HashMap<>();

    static {
        for (ErrorCode value : values()) {
            BY_CODE.put(value.code, value);
        }
    }

    /** 按码值查找；未定义时回落到 500，保证异常链不会因为错误码缺失而二次崩溃 */
    public static ErrorCode fromCode(int code) {
        return BY_CODE.getOrDefault(code, SERVER);
    }
}
