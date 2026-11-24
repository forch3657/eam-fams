package com.fams.module.liuxun;

import com.fams.common.R;
import com.fams.common.ErrorCode;
import com.fams.module.auth.LoginResponse;
import com.fams.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 柳讯免登与同步端点。
 *
 * <p>路径 /api/auth/liuxun/**，在 fams.security.permit-all 中放行：
 * 回调换 token 时前端还没有本地 JWT。</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/auth/liuxun")
@RequiredArgsConstructor
public class LiuxunController {

    private final LiuxunOAuth2Client oauth2Client;
    private final LiuxunUserService userService;
    private final LiuxunTodoService todoService;
    private final JwtProvider jwtProvider;

    /** 前端登录入口用：拿到柳讯授权页地址与 mock 标记 */
    @GetMapping("/config")
    public R<Map<String, Object>> config() {
        return R.ok(oauth2Client.publicConfig());
    }

    /**
     * 授权码换本地会话：code → 柳讯 token + account_info → 映射既有本地账号 → 自有 JWT。
     * 未预置账号直接拒绝（不自动建号），返回结构与 /api/auth/login 一致，前端可复用登录态写入。
     */
    @PostMapping("/token")
    public R<LoginResponse> token(@RequestBody(required = false) Map<String, Object> body) {
        try {
            String code = body == null ? "" : String.valueOf(body.getOrDefault("code", ""));
            if (code.trim().isEmpty()) {
                return R.fail(ErrorCode.BAD_REQUEST, "授权码 code 不能为空");
            }
            LiuxunTokenResponse token = oauth2Client.exchangeCodeForToken(code);
            LiuxunAccount account = LiuxunAccount.from(token.getAccountInfo());
            if (account == null || (account.getUserName() == null && account.getTelephone() == null)) {
                return R.fail(ErrorCode.UNAUTHORIZED, "柳讯未返回用户手机号，无法映射本地账号");
            }
            Map<String, Object> local = userService.resolveExisting(account);
            String username = String.valueOf(local.get("username"));
            String positionId = userService.primaryPositionIdOf(String.valueOf(local.get("id")));
            String jwt = jwtProvider.generate(username, positionId);
            return R.ok(new LoginResponse(jwt, userService.sanitize(local)));
        } catch (IllegalStateException e) {
            log.warn("[liuxun] 换 token 失败: {}", e.getMessage());
            return R.fail(ErrorCode.UNAUTHORIZED, e.getMessage());
        } catch (IllegalArgumentException e) {
            return R.fail(ErrorCode.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun] 免登异常", e);
            return R.fail(ErrorCode.SERVER, "柳讯免登失败：" + e.getMessage());
        }
    }

    /** mock 自检：走一遍预置账号免登 + 待办 CRUD，不依赖柳讯配置 */
    @PostMapping("/mock-selftest")
    public R<Map<String, Object>> mockSelfTest(@RequestBody(required = false) Map<String, Object> body) {
        if (!oauth2Client.publicConfig().get("mock").equals(Boolean.TRUE)) {
            return R.fail(ErrorCode.BAD_REQUEST, "仅 mock 模式可用");
        }
        Map<String, Object> report = new LinkedHashMap<>();
        try {
            LiuxunAccount account = new LiuxunAccount(157L, "13625070487", "测试用户", "13625070487", "", "");
            Map<String, Object> local = userService.resolveExisting(account);
            report.put("username", local.get("username"));
            report.put("name", local.get("name"));
            report.put("roleIds", local.get("roleIds"));
            report.put("positionId", userService.primaryPositionIdOf(String.valueOf(local.get("id"))));

            LiuxunTodoRequest todo = new LiuxunTodoRequest();
            todo.setName("mock-selftest");
            todo.setBizId("MOCK-" + System.currentTimeMillis());
            todo.setBizUrl("http://192.168.60.66/oauth/entry?target=/workbench");
            todo.setUserIds(java.util.Collections.singletonList(157L));
            todo.setCreateUserId(157L);
            long todoId = todoService.create(todo);
            report.put("todoId", todoId);
            todoService.complete(todoId, 157L);
            todoService.delete(todoId);
            report.put("ok", true);
            return R.ok(report);
        } catch (Exception e) {
            log.error("[liuxun] mock 自检失败", e);
            report.put("ok", false);
            report.put("error", e.getMessage());
            return R.ok(report);
        }
    }
}
