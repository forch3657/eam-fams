package com.fams.engine;

import org.apache.ibatis.annotations.DeleteProvider;
import org.apache.ibatis.annotations.InsertProvider;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.SelectProvider;
import org.apache.ibatis.annotations.UpdateProvider;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 通用集合数据访问。
 *
 * <p>表名与列名由 {@link SqlProvider} 依据元数据拼装，值一律走 #{} 占位，
 * 因此不存在 SQL 注入面（标识符仅来自契约白名单）。</p>
 */
@Mapper
public interface GenericMapper {

    @SelectProvider(type = SqlProvider.class, method = "selectList")
    List<Map<String, Object>> selectList(Map<String, Object> params);

    @SelectProvider(type = SqlProvider.class, method = "count")
    long count(Map<String, Object> params);

    @SelectProvider(type = SqlProvider.class, method = "selectById")
    Map<String, Object> selectById(Map<String, Object> params);

    @InsertProvider(type = SqlProvider.class, method = "insert")
    int insert(Map<String, Object> params);

    @UpdateProvider(type = SqlProvider.class, method = "updateById")
    int updateById(Map<String, Object> params);

    @DeleteProvider(type = SqlProvider.class, method = "deleteById")
    int deleteById(Map<String, Object> params);

    @DeleteProvider(type = SqlProvider.class, method = "deleteAll")
    int deleteAll(Map<String, Object> params);

    /** 单行单列更新（库存联动专用，绕过业务规则与 version 自增） */
    @UpdateProvider(type = SqlProvider.class, method = "updateColumn")
    int updateColumn(Map<String, Object> params);

    /** 行锁读取（库存变更前的悲观锁，防并发超卖） */
    @SelectProvider(type = SqlProvider.class, method = "selectForUpdate")
    Map<String, Object> selectForUpdate(Map<String, Object> params);

    /** 按条件求和（退库限额 / 领用总量统计） */
    @SelectProvider(type = SqlProvider.class, method = "sum")
    BigDecimal sum(Map<String, Object> params);

    /** 按任意条件更新单列（如登录时间回填） */
    @UpdateProvider(type = SqlProvider.class, method = "updateWhere")
    int updateWhere(Map<String, Object> params);
}
