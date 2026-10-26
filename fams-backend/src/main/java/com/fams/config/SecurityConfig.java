package com.fams.config;

import com.fams.common.ErrorCode;
import com.fams.common.R;
import com.fams.security.JwtAuthFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import java.time.Clock;

/**
 * Spring Security 配置（部门规范）：无状态 JWT + RBAC。
 *
 * <p>未登录 / token 失效返回 401 信封，权限不足返回 403 信封，
 * 与契约第 2 节一致；前端收到 401 会清空会话并跳登录页。</p>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    private final CorsConfigurationSource corsConfigurationSource;

    private final ObjectMapper objectMapper;

    private final SecurityProperties securityProperties;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        org.springframework.security.web.util.matcher.AntPathRequestMatcher[] permitAll =
                securityProperties.getPermitAll().stream()
                        .map(path -> new org.springframework.security.web.util.matcher.AntPathRequestMatcher("/api" + path))
                        .toArray(org.springframework.security.web.util.matcher.AntPathRequestMatcher[]::new);

        http
                .csrf().disable()
                .cors().configurationSource(corsConfigurationSource).and()
                .httpBasic().disable()
                .formLogin().disable()
                .logout().disable()
                .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS).and()
                .exceptionHandling()
                    .authenticationEntryPoint((request, response, ex) -> write(response, ErrorCode.UNAUTHORIZED))
                    .accessDeniedHandler((request, response, ex) -> write(response, ErrorCode.FORBIDDEN))
                .and()
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(permitAll).permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** 注入 Clock 便于对「锁定 30 分钟」做时间旅行测试 */
    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }

    private void write(javax.servlet.http.HttpServletResponse response, ErrorCode code) throws java.io.IOException {
        response.setStatus(code == ErrorCode.UNAUTHORIZED
                ? HttpStatus.UNAUTHORIZED.value() : HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        objectMapper.writeValue(response.getOutputStream(), R.fail(code));
    }
}
