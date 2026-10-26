package com.fams.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import javax.validation.ConstraintViolation;
import javax.validation.ConstraintViolationException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 全局异常处理：任何异常都收敛为统一信封 { code, message, data }。
 *
 * <p>HTTP 状态码策略：
 * <ul>
 *   <li>标准语义错误（400/401/403/404/409/422）→ 使用对应 HTTP 状态码，body 仍为信封；</li>
 *   <li>业务错误码（1001~1006）→ HTTP 200，由信封 code 承载语义。</li>
 * </ul>
 * 前端 http.js 对两种形式都能正确解析并抛出 ApiError。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<R<Void>> handleApiException(ApiException ex) {
        HttpStatus status = resolveStatus(ex.getCode());
        if (status == HttpStatus.INTERNAL_SERVER_ERROR) {
            log.warn("业务异常 code={}: {}", ex.getCode(), ex.getMessage());
        }
        R<Void> body = R.fail(ErrorCode.fromCode(ex.getCode()), ex.getMessage(), ex.getDetails());
        return ResponseEntity.status(status).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<R<Void>> handleNotValid(MethodArgumentNotValidException ex) {
        return validation(ex.getBindingResult().getFieldErrors());
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<R<Void>> handleBind(BindException ex) {
        return validation(ex.getBindingResult().getFieldErrors());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<R<Void>> handleConstraint(ConstraintViolationException ex) {
        List<Map<String, String>> details = new ArrayList<>();
        for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
            details.add(detail(String.valueOf(violation.getPropertyPath()), violation.getMessage()));
        }
        return fail(ErrorCode.VALIDATION, join(details), details);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<R<Void>> handleMissingParam(MissingServletRequestParameterException ex) {
        return fail(ErrorCode.BAD_REQUEST, "缺少请求参数：" + ex.getParameterName(), null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<R<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return fail(ErrorCode.BAD_REQUEST, "请求参数类型有误：" + ex.getName(), null);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<R<Void>> handleNotReadable(HttpMessageNotReadableException ex) {
        return fail(ErrorCode.BAD_REQUEST, "请求体无法解析", null);
    }

    /** 未匹配到任何 handler → 404（依赖 spring.mvc.throw-exception-if-no-handler-found=true） */
    @ExceptionHandler(org.springframework.web.servlet.NoHandlerFoundException.class)
    public ResponseEntity<R<Void>> handleNoHandler(org.springframework.web.servlet.NoHandlerFoundException ex) {
        return fail(ErrorCode.NOT_FOUND, "接口不存在：" + ex.getRequestURL(), null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<R<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        return fail(ErrorCode.BAD_REQUEST, "不支持的请求方法：" + ex.getMethod(), null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<R<Void>> handleException(Exception ex) {
        log.error("服务异常", ex);
        return fail(ErrorCode.SERVER, ErrorCode.SERVER.getMessage(), null);
    }

    private ResponseEntity<R<Void>> validation(List<FieldError> fieldErrors) {
        List<Map<String, String>> details = fieldErrors.stream()
                .map(e -> detail(e.getField(), e.getDefaultMessage()))
                .collect(Collectors.toList());
        return fail(ErrorCode.VALIDATION, join(details), details);
    }

    private ResponseEntity<R<Void>> fail(ErrorCode code, String message, List<Map<String, String>> details) {
        return ResponseEntity.status(code.getCode() == ErrorCode.SERVER.getCode()
                ? HttpStatus.INTERNAL_SERVER_ERROR : resolveStatus(code.getCode()))
                .body(R.fail(code, message, details));
    }

    private static String join(List<Map<String, String>> details) {
        return String.join("；", details.stream()
                .map(d -> d.get("field") + " " + d.get("message"))
                .collect(Collectors.toList()));
    }

    private static Map<String, String> detail(String field, String message) {
        Map<String, String> m = new HashMap<>(4);
        m.put("field", field);
        m.put("message", message);
        return m;
    }

    /** 契约错误码 → HTTP 状态码；业务码 1001~1006 一律 200（语义由信封承载） */
    private static HttpStatus resolveStatus(int code) {
        switch (code) {
            case 400: return HttpStatus.BAD_REQUEST;
            case 401: return HttpStatus.UNAUTHORIZED;
            case 403: return HttpStatus.FORBIDDEN;
            case 404: return HttpStatus.NOT_FOUND;
            case 409: return HttpStatus.CONFLICT;
            case 422: return HttpStatus.UNPROCESSABLE_ENTITY;
            default: return HttpStatus.OK;
        }
    }
}
