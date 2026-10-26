package com.fams.module.health;

import com.fams.common.R;
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

    @GetMapping("/health")
    public R<Map<String, Object>> health() {
        Map<String, Object> data = new LinkedHashMap<>(4);
        data.put("status", "UP");
        data.put("time", LocalDateTime.now());
        return R.ok(data);
    }
}
