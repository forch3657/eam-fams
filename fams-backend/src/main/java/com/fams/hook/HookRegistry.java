package com.fams.hook;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 钩子注册表：按集合 key 聚合钩子，全局钩子对所有集合生效。
 *
 * <p>注意：本类只保留「注入全部 ResourceHook」这唯一构造器，不能再有其它构造器，
 * 否则 Spring 会退回到无参构造，导致所有钩子都注册不进来。</p>
 */
@Component
public class HookRegistry {

    private final Map<String, List<ResourceHook>> byKey = new HashMap<>();

    private final List<ResourceHook> global = new ArrayList<>();

    public HookRegistry(List<ResourceHook> hooks) {
        for (ResourceHook hook : hooks == null ? Collections.<ResourceHook>emptyList() : hooks) {
            Set<String> keys = hook.keys();
            if (keys == null || keys.isEmpty()) {
                global.add(hook);
                continue;
            }
            for (String key : keys) {
                byKey.computeIfAbsent(key, k -> new ArrayList<>()).add(hook);
            }
        }
    }

    public List<ResourceHook> forCollection(String key) {
        List<ResourceHook> result = new ArrayList<>(global);
        List<ResourceHook> scoped = byKey.get(key);
        if (scoped != null) {
            result.addAll(scoped);
        }
        return result;
    }
}
