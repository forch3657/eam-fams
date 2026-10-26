package com.fams.contract;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 集合注册表：key → 元数据。
 *
 * <p>静态契约来自 resources.json；运行期新建的动态集合（如新增字典类型）
 * 由 {@link DynamicKeyResolver} 按模式解析后缓存。</p>
 */
@Slf4j
@Component
public class ResourceRegistry {

    private final Map<String, ResourceMeta> byKey = Collections.synchronizedMap(new LinkedHashMap<>());

    public ResourceRegistry(ResourceDefinitionLoader loader) {
        for (ResourceMeta meta : loader.loadResources()) {
            byKey.put(meta.getKey(), meta);
        }
    }

    /** 解析集合；未知 key 抛出 404（防止任意表名进入 SQL） */
    public ResourceMeta resolve(String key) {
        ResourceMeta meta = byKey.get(key);
        if (meta != null) {
            return meta;
        }
        if (DynamicKeyResolver.isDynamic(key)) {
            ResourceMeta dynamic = DynamicKeyResolver.resolve(key);
            if (dynamic != null) {
                log.info("解析动态集合：{} → {}", key, dynamic.getTable());
                byKey.put(key, dynamic);
                return dynamic;
            }
        }
        throw new ApiException(ErrorCode.NOT_FOUND, "未知的集合：" + key);
    }

    public boolean exists(String key) {
        return byKey.containsKey(key) || DynamicKeyResolver.isDynamic(key);
    }

    public Collection<ResourceMeta> all() {
        return Collections.unmodifiableCollection(byKey.values());
    }
}
