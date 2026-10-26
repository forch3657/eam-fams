package com.fams.module.system;

import com.fams.common.R;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 操作日志切面（部门规范：审计留痕）。
 *
 * <p>统一拦截通用引擎的写端点，落 {@code operation-logs} 集合，
 * 不在每个业务方法里重复写日志代码。</p>
 *
 * <p>只记录写操作：读接口不记日志，避免日志表被查询流量灌满。</p>
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class OperationLogAspect {

    private static final String OPERATION_LOGS = "operation-logs";

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

    private final GenericService genericService;

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
        String pathTarget = pathTarget(method, args);

        try {
            Object result = joinPoint.proceed();
            write(key, method, resultTarget(result, key, pathTarget), "SUCCESS", "");
            return result;
        } catch (Throwable ex) {
            write(key, method, pathTarget, "FAILED", ex.getMessage());
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

    private void write(String key, String method, String target, String result, String detail) {
        try {
            Map<String, Object> row = new HashMap<>();
            row.put("time", LocalDateTime.now());
            row.put("module", moduleOf(key));
            row.put("action", ACTIONS.getOrDefault(method, method));
            row.put("target", target);
            row.put("result", result);
            row.put("detail", truncate((key + " " + target
                    + (detail == null || detail.isEmpty() ? "" : "：" + detail)).trim(), 200));
            row.put("operator", AuthContext.currentUsername());
            genericService.create(OPERATION_LOGS, row);
        } catch (RuntimeException ex) {
            // 日志落库失败绝不能影响业务操作本身
            log.warn("操作日志写入失败：{}", ex.getMessage());
        }
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
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
