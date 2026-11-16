package com.fams.config;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;

/**
 * D3 链路追踪：为每个请求生成/透传 traceId，写入 MDC（供 logback 打印），
 * 并通过响应头 X-Trace-Id 回传，便于前端错误上报与审计日志串联。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Trace-Id";
    public static final String MDC_KEY = "traceId";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String trace = request.getHeader(HEADER);
        if (!StringUtils.hasText(trace)) {
            trace = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        }
        if (trace.length() > 40) {
            trace = trace.substring(0, 40);
        }
        MDC.put(MDC_KEY, trace);
        response.setHeader(HEADER, trace);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}
