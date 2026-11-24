package com.fams.module.liuxun;

import com.fams.common.ErrorCode;
import com.fams.common.R;
import com.fams.engine.PermissionPolicy;
import com.fams.common.ApiException;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 柳讯通讯录批量预置 / 按公司批量启用。
 *
 * <p>与免登端点不同，本控制器<b>不在 permit-all 放行列表</b>：所有端点要求登录态，
 * 并显式校验组织架构写权限（org-companies / org-departments / org-users）。
 * 预览与执行都要求写权限，避免只读账号探测通讯录全量数据。</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/liuxun-sync")
@RequiredArgsConstructor
public class LiuxunSyncController {

    private final LiuxunSyncService syncService;
    private final PermissionPolicy permissionPolicy;

    /** 拉取通讯录并给出「待预置」计划，不写库。通讯录接口需用户 token，故现场用账号密码换 token。 */
    @PostMapping("/preview")
    public R<Map<String, Object>> preview(@RequestBody(required = false) Map<String, Object> body) {
        requireOrgWrite();
        String[] cred = credentials(body);
        try {
            return R.ok(syncService.preview(cred[0], cred[1]));
        } catch (IllegalStateException e) {
            log.warn("[liuxun-sync] 预览失败: {}", e.getMessage());
            return R.fail(ErrorCode.SERVER, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun-sync] 预览异常", e);
            return R.fail(ErrorCode.SERVER, "通讯录预览失败：" + e.getMessage());
        }
    }

    /** 批量预置：只建档案、默认启用、不赋角色；已存在的一律跳过 */
    @PostMapping("/apply")
    public R<Map<String, Object>> apply(@RequestBody(required = false) Map<String, Object> body) {
        requireOrgWrite();
        String[] cred = credentials(body);
        try {
            return R.ok(syncService.apply(cred[0], cred[1]));
        } catch (IllegalStateException e) {
            log.warn("[liuxun-sync] 预置失败: {}", e.getMessage());
            return R.fail(ErrorCode.SERVER, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun-sync] 预置异常", e);
            return R.fail(ErrorCode.SERVER, "通讯录预置失败：" + e.getMessage());
        }
    }

    /** 从请求体提取柳讯账号密码，缺字段时返回空串由服务层给出明确提示 */
    private static String[] credentials(Map<String, Object> body) {
        if (body == null) return new String[]{"", ""};
        return new String[]{
                String.valueOf(body.getOrDefault("phone", "")),
                String.valueOf(body.getOrDefault("password", ""))
        };
    }

    /**
     * 只预置组织（公司/部门）：柳讯组织树 → 现成组织架构导入服务。
     * 不建用户/岗位、按名称幂等复用、多级层级完整保留。
     */
    @PostMapping("/apply-organizations")
    public R<Map<String, Object>> applyOrganizations(@RequestBody(required = false) Map<String, Object> body) {
        requireOrgWrite();
        String phone = body == null ? "" : String.valueOf(body.getOrDefault("phone", ""));
        String password = body == null ? "" : String.valueOf(body.getOrDefault("password", ""));
        try {
            return R.ok(syncService.applyOrganizationsOnly(phone, password));
        } catch (IllegalStateException e) {
            log.warn("[liuxun-sync] 组织预置失败: {}", e.getMessage());
            return R.fail(ErrorCode.SERVER, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun-sync] 组织预置异常", e);
            return R.fail(ErrorCode.SERVER, "组织预置失败：" + e.getMessage());
        }
    }

    /** 按公司批量启用该公司下所有未启用的用户 */
    @PostMapping("/enable-by-company")
    public R<Map<String, Object>> enableByCompany(@RequestBody(required = false) Map<String, Object> body) {
        requireOrgWrite();
        String companyId = body == null ? "" : String.valueOf(body.getOrDefault("companyId", ""));
        try {
            return R.ok(syncService.enableByCompany(companyId));
        } catch (ApiException e) {
            return R.fail(ErrorCode.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun-sync] 批量启用异常", e);
            return R.fail(ErrorCode.SERVER, "批量启用失败：" + e.getMessage());
        }
    }

    /** 公司/部门/用户三项写权限同时具备才允许同步，口径同组织架构导入 */
    private void requireOrgWrite() {
        for (String key : new String[]{"org-companies", "org-departments", "org-users"}) {
            if (!permissionPolicy.matches(key, "POST", AuthContext.granted())) {
                throw new ApiException(ErrorCode.FORBIDDEN, "无权限执行柳讯组织人员同步：" + key);
            }
        }
    }
}
