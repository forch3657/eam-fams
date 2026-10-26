package com.fams.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis-Plus 配置。
 *
 * <p>说明：通用 CRUD 引擎面向「运行时才知道表名/字段」的动态集合，
 * 无法使用 BaseMapper&lt;T&gt;/Wrapper 这类实体驱动能力，其 SQL 由
 * {@link com.fams.engine.SqlProvider} 按元数据白名单拼装。
 * MP 在此负责 SqlSessionFactory 基建与分页插件（供后续实体型 Mapper 使用）。</p>
 */
@Configuration
public class MybatisPlusConfig {

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
