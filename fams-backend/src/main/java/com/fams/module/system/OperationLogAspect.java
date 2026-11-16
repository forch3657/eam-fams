package com.fams.module.system;

import com.fams.common.R;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 操作日志切面（部门规范：审计留痕）。
 *
 * <p>统一拦截通用引擎的写端点，经 {@link AuditLogService} 落 {@code operation-logs}，
 * 不在每个业务方法里重复写日志代码。只记录写操作，读接口不记日志。</p>
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class OperationLogAspect {

    private static final Set<String> WRITE_METHODS = new HashSet<>(Arrays.asList(
            "create", "update", "remove", "batch", "clear"));

    private static final Map<String, String> ACTIONS = new HashMap<>();

    static {
        ACTIONS.put("create", "新增");
        ACTIONS.put("update", "修改");
        ACTIONS.put("remove", "删除");
        ACTIONS.put("batch", "批量保存");
        ACTIONS.put("clear", "清空");
    }

    private final AuditLogService auditLogService;

    private final ResourceRegistry registry;

    @Pointcut("execution(* com.fams.engine.GenericController.*(..))")
    public void genericEndpoints() {
    }

    @Around("genericEndpoints()")
    public Object record(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = joinPoint.getSignature().getName();
        if (!WRITE_METHODS.contains(method)) {
            return joinPoint.proceed();
        }
        Object[] args = joinPoint.getArgs();
        String key = args.length > 0 && args[0] != null ? String.valueOf(args[0]) : "";
        if (AuditLogService.OPERATION_LOGS.equals(key)) {
            // append-only：审计表自身的写入不再递归记日志
            return joinPoint.proceed();
        }
        String pathTarget = pathTarget(method, args);

        try {
            Object result = joinPoint.proceed();
            String target = resultTarget(result, key, pathTarget);
            auditLogService.record(moduleOf(key), ACTIONS.getOrDefault(method, method),
                    target, "SUCCESS", key + " " + target, null);
            return result;
        } catch (Throwable ex) {
            auditLogService.record(moduleOf(key), ACTIONS.getOrDefault(method, method),
                    pathTarget, "FAILED", key + "：" + ex.getMessage(), null);
            throw ex;
        }
    }

    /** 更新 / 删除：被操作对象就是路径段 {id} */
    private static String pathTarget(String method, Object[] args) {
        if (("update".equals(method) || "remove".equals(method)) && args.length > 1 && args[1] != null) {
            return String.valueOf(args[1]);
        }
        if ("batch".equals(method) && args.length > 1 && args[1] instanceof Iterable) {
            int size = 0;
            for (Object ignored : (Iterable<?>) args[1]) {
                size++;
            }
            return size + " 行";
        }
        return "";
    }

    /** 新增：主键由服务端生成，只能从返回体里取 */
    private String resultTarget(Object result, String key, String fallback) {
        if (result instanceof R) {
            Object data = ((R<?>) result).getData();
            if (data instanceof Map) {
                Object pk = ((Map<?, ?>) data).get(registry.resolve(key).getPkField());
                if (pk != null && !String.valueOf(pk).trim().isEmpty()) {
                    return String.valueOf(pk);
                }
            }
        }
        return fallback;
    }

    /** 集合 key → 所属模块（用于日志归类） */
    private static String moduleOf(String key) {
        if (key.startsWith("fixed-asset")) {
            return "固定资产";
        }
        if (key.startsWith("low-value")) {
            return "低值资产";
        }
        if (key.startsWith("org-")) {
            return "组织架构";
        }
        if (key.startsWith("notify-")) {
            return "消息中心";
        }
        return "系统管理";
    }
}
