package com.fams.module.system;

import com.fams.common.R;
import com.fams.module.approval.ApprovalRequest;
import com.fams.module.auth.LoginRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 关键业务动作审计（S-07）。
 *
 * <p>通用 CRUD 的留痕由 {@link OperationLogAspect} 负责，这里补足非通用端点的动作：
 * 登录 / 审批 / 导入 / 折旧 / 数据重置。切在 Controller 层（业务事务之外），
 * 保证动作失败抛异常时审计行仍能落库。</p>
 *
 * <p>绝不记录口令、确认串等敏感入参；detail 只取账号、单号、动作名等非敏感标识。</p>
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class BusinessAuditAspect {

    private final AuditLogService auditLogService;

    @Pointcut("execution(* com.fams.module.auth.AuthController.login(..))")
    public void loginAction() {
    }

    @Pointcut("execution(* com.fams.module.approval.ApprovalController.action(..))")
    public void approvalAction() {
    }

    @Pointcut("execution(* com.fams.module.depreciation.DepreciationController.run(..))")
    public void depreciationAction() {
    }

    @Pointcut("execution(* com.fams.imports.DataImportController.upload(..))"
            + " || execution(* com.fams.imports.DataImportController.orgUpload(..))"
            + " || execution(* com.fams.imports.DataImportController.lowValueUpload(..))"
            + " || execution(* com.fams.imports.DataImportController.fixedAssetUpload(..))")
    public void importAction() {
    }

    @Pointcut("execution(* com.fams.imports.DataImportController.reset(..))")
    public void resetAction() {
    }

    @Around("loginAction()")
    public Object auditLogin(ProceedingJoinPoint jp) throws Throwable {
        String username = "";
        for (Object arg : jp.getArgs()) {
            if (arg instanceof LoginRequest) {
                username = ((LoginRequest) arg).getUsername();
                break;
            }
        }
        return aroundRecord(jp, "认证", "登录", username, username, username);
    }

    @Around("approvalAction()")
    public Object auditApproval(ProceedingJoinPoint jp) throws Throwable {
        String docKey = "", docId = "", action = "";
        for (Object arg : jp.getArgs()) {
            if (arg instanceof ApprovalRequest) {
                ApprovalRequest req = (ApprovalRequest) arg;
                docKey = req.getDocKey() == null ? "" : req.getDocKey();
                docId = req.getDocId() == null ? "" : req.getDocId();
                action = req.getAction() == null ? "" : req.getAction();
                break;
            }
        }
        String target = docKey + "/" + docId;
        return aroundRecord(jp, "审批", "审批-" + action, target, target,
                "单据=" + docKey + " 动作=" + action);
    }

    @Around("depreciationAction()")
    public Object auditDepreciation(ProceedingJoinPoint jp) throws Throwable {
        String period = "";
        if (jp.getArgs().length > 0 && jp.getArgs()[0] instanceof Map) {
            Object p = ((Map<?, ?>) jp.getArgs()[0]).get("period");
            period = p == null ? "" : String.valueOf(p);
        }
        return aroundRecord(jp, "固定资产", "折旧计提", period, period, "期间=" + period);
    }

    @Around("importAction()")
    public Object auditImport(ProceedingJoinPoint jp) throws Throwable {
        String key = jp.getSignature().getName();
        Object[] args = jp.getArgs();
        if (args.length > 0 && args[0] instanceof String) {
            key = (String) args[0];
        }
        return aroundRecord(jp, "系统管理", "数据导入", key, key, "集合=" + key);
    }

    @Around("resetAction()")
    public Object auditReset(ProceedingJoinPoint jp) throws Throwable {
        String scope = "";
        Object[] args = jp.getArgs();
        if (args.length > 0) {
            scope = String.valueOf(args[0]); // 不记录 confirm 参数
        }
        return aroundRecord(jp, "系统管理", "数据重置", scope, scope, "范围=" + scope);
    }

    /** 统一包装：成功/失败都记一条；审计写入失败由 AuditLogService 内部吞掉 */
    private Object aroundRecord(ProceedingJoinPoint jp, String module, String action,
                                String target, String detail, String operator) throws Throwable {
        try {
            Object result = jp.proceed();
            auditLogService.record(module, action, target, "SUCCESS", detail, operator);
            return result;
        } catch (Throwable ex) {
            auditLogService.record(module, action, target, "FAILED", detail + "：" + safeMessage(ex), operator);
            throw ex;
        }
    }

    private static String safeMessage(Throwable ex) {
        String msg = ex.getMessage();
        if (msg == null || msg.isEmpty()) {
            return ex.getClass().getSimpleName();
        }
        return msg.length() > 120 ? msg.substring(0, 120) : msg;
    }
}
