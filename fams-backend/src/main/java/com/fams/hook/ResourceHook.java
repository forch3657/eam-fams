package com.fams.hook;

import com.fams.contract.ResourceMeta;

import java.util.Collections;
import java.util.Map;
import java.util.Set;

/**
 * 集合钩子：契约里**无法声明式表达**的业务规则在此按集合注入。
 *
 * <p>能够声明的（唯一性 / 外键 / 删除保护 / 库存联动）都由规则引擎按元数据执行，
 * 不要重复实现。</p>
 */
public interface ResourceHook {

    /** 作用的集合 key；返回空集表示对所有集合生效 */
    default Set<String> keys() {
        return Collections.emptySet();
    }

    default void beforeCreate(ResourceMeta meta, Map<String, Object> row) {
    }

    default void afterCreate(ResourceMeta meta, Map<String, Object> row) {
    }

    default void beforeUpdate(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
    }

    default void afterUpdate(ResourceMeta meta, Map<String, Object> next, Map<String, Object> previous) {
    }

    /**
     * 删除保护：命中即抛异常。
     *
     * <p>契约要求该方法必须在库存回退之前执行，否则会出现「报了 1003 但库存已回退」。</p>
     */
    default void checkDelete(ResourceMeta meta, Map<String, Object> row) {
    }

    default void afterDelete(ResourceMeta meta, Map<String, Object> row) {
    }
}
