package com.fams.module.system;

import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 审计留痕统一写入口（S-07）。
 *
 * <p>所有需要留痕的业务动作（登录、审批、导入、折旧、重置、通用 CRUD）都经这里
 * 写 {@code operation-logs}，保证字段格式一致、失败只告警不影响业务。</p>
 *
 * <p>IP / UA / traceId / companyId 的落地受现有表结构约束：operation_logs 只有
 * ip / detail / operatorOrg 列，没有 ua / traceId / companyId 独立列。为不引入
 * 需要管理员权限的 DDL，把 UA 与 traceId 以结构化前缀写进 detail，把公司标识写进
 * operatorOrg；后续 D3 扩列时只需改这里一处，读取方无需感知。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    public static final String OPERATION_LOGS = "operation-logs";

    private static final int DETAIL_MAX = 200;

    private final GenericService genericService;

    /**
     * 写一条操作日志。
     *
     * @param module  模块（固定资产 / 低值资产 / 审批 …）
     * @param action  动作（新增 / 提交审批 / 登录 …）
     * @param target  被操作对象标识（主键 / 单号 / 用户名，不含口令等敏感信息）
     * @param result  SUCCESS / FAILED
     * @param detail  补充说明，内部再做 200 字截断
     * @param operator 操作账号；为空时取当前登录主体（登录失败等无主体场景需显式传）
     */
    public void record(String module, String action, String target, String result,
                       String detail, String operator) {
        try {
            Map<String, Object> row = new HashMap<>();
            row.put("time", LocalDateTime.now());
            row.put("module", truncate(module, 50));
            row.put("action", truncate(action, 50));
            row.put("target", truncate(target, 100));
            row.put("result", result);
            row.put("operator", truncate(
                    operator != null && !operator.isEmpty() ? operator : currentUsername(), 50));
            row.put("ip", clientIp());
            row.put("operatorOrg", companyId());

            String trace = traceId();
            String ua = userAgent();
            StringBuilder d = new StringBuilder();
            d.append("[trace=").append(trace).append(']');
            if (ua != null && !ua.isEmpty()) {
                d.append("[ua=").append(truncate(ua, 60)).append(']');
            }
            String extra = detail == null ? "" : detail.trim();
            if (!extra.isEmpty()) {
                d.append(extra);
            }
            row.put("detail", truncate(d.toString(), DETAIL_MAX));

            genericService.create(OPERATION_LOGS, row);
        } catch (RuntimeException ex) {
            // 日志落库失败绝不能影响业务操作本身
            log.warn("[audit] 操作日志写入失败（已忽略）：{}", ex.getMessage());
        }
    }

    private static String currentUsername() {
        UserPrincipal me = AuthContext.current();
        return me == null ? "anonymous" : me.getUsername();
    }

    private static String companyId() {
        UserPrincipal me = AuthContext.current();
        return me == null ? "" : me.getCompanyId();
    }

    /** 优先取代理头，避免 nginx 反代后只记录 127.0.0.1 */
    private static String clientIp() {
        HttpServletRequest req = request();
        if (req == null) {
            return "";
        }
        String ip = req.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = req.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty()) {
            ip = req.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return truncate(ip, 50);
    }

    private static String userAgent() {
        HttpServletRequest req = request();
        return req == null ? "" : req.getHeader("User-Agent");
    }

    /** D3：优先取 MDC 中的 traceId（与 logback/前端上报同一条链路），回退请求头或新生成 */
    private static String traceId() {
        String trace = org.slf4j.MDC.get("traceId");
        if (trace == null || trace.isEmpty()) {
            HttpServletRequest req = request();
            trace = req == null ? null : req.getHeader("X-Trace-Id");
        }
        if (trace == null || trace.isEmpty()) {
            trace = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        }
        return truncate(trace, 40);
    }

    private static HttpServletRequest request() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes) {
            return ((ServletRequestAttributes) RequestContextHolder.getRequestAttributes()).getRequest();
        }
        return null;
    }

    private static String truncate(String value, int max) {
        return value == null ? "" : (value.length() <= max ? value : value.substring(0, max));
    }
}
