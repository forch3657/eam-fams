package com.fams.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 独立的密码编码器配置。
 *
 * <p>必须放在 {@link SecurityConfig} 之外的配置类，否则会与
 * GenericService（注入 PasswordEncoder）→ SecurityConfig（定义该 Bean）→
 * JwtAuthFilter → UserDetailsServiceImpl → GenericService 形成循环依赖。</p>
 */
@Configuration
public class SecurityBeansConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
