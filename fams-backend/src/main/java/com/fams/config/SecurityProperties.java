package com.fams.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 安全相关配置。
 */
@Data
@Component
@ConfigurationProperties(prefix = "fams.security")
public class SecurityProperties {

    /** 免鉴权路径（相对 context，如 /health、/auth/login） */
    private List<String> permitAll = new ArrayList<>();
}
