package com.fams.module.health;

import com.fams.common.R;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查：用于验证统一信封与 CORS 是否生效（P0 验收口径）。
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    /** 应用启动时间：同一次部署内不变，用于区分「后端已重启」与「前端还是旧包」 */
    private static final LocalDateTime STARTED_AT = LocalDateTime.now();

    /**
     * 对外版本号。与前端 package.json / dist 的 meta[name=app-version] 对齐，
     * 部署时可用环境变量 APP_VERSION 覆盖；不一致时前端会提示刷新（P1-3）。
     */
    @Value("${APP_VERSION:1.0.0}")
    private String appVersion;

    @GetMapping("/health")
    public R<Map<String, Object>> health() {
        Map<String, Object> data = new LinkedHashMap<>(4);
        data.put("status", "UP");
        data.put("time", LocalDateTime.now());
        return R.ok(data);
    }

    @GetMapping("/version")
    public R<Map<String, Object>> version() {
        Map<String, Object> data = new LinkedHashMap<>(4);
        data.put("version", appVersion);
        data.put("startedAt", STARTED_AT);
        return R.ok(data);
    }
}
