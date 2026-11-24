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

    /** 拉取通讯录并给出「待预置」计划，不写库 */
    @PostMapping("/preview")
    public R<Map<String, Object>> preview() {
        requireOrgWrite();
        try {
            return R.ok(syncService.preview());
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
    public R<Map<String, Object>> apply() {
        requireOrgWrite();
        try {
            return R.ok(syncService.apply());
        } catch (IllegalStateException e) {
            log.warn("[liuxun-sync] 预置失败: {}", e.getMessage());
            return R.fail(ErrorCode.SERVER, e.getMessage());
        } catch (Exception e) {
            log.error("[liuxun-sync] 预置异常", e);
            return R.fail(ErrorCode.SERVER, "通讯录预置失败：" + e.getMessage());
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
