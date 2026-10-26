package com.fams;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 资产管理系统后端启动类。
 *
 * <p>遵循阿里巴巴 Java 开发手册：类名 UpperCamelCase，包名全小写，启动类置于根包下。</p>
 */
@SpringBootApplication
public class FamsApplication {

    public static void main(String[] args) {
        SpringApplication.run(FamsApplication.class, args);
    }
}
