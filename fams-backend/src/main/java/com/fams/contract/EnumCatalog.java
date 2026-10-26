package com.fams.contract;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 枚举取值白名单：内置枚举 ∪ 运行期字典项。
 *
 * <p>契约 7.1 允许在「数据字典」页新增字典项，新增编码与内置枚举取并集构成合法取值范围，
 * 因此白名单不可写死，需在字典数据变更后由 {@code DictEnumSync} 刷新。</p>
 */
@Slf4j
@Component
public class EnumCatalog {

    /** 枚举名 → {编码 → 文案} */
    private final Map<String, Map<String, String>> builtinLabels = new ConcurrentHashMap<>();

    /** 枚举名 → 内置编码集合 */
    private final Map<String, Set<String>> builtinCodes = new ConcurrentHashMap<>();

    /** 字典类型 code → 枚举名 */
    private final Map<String, String> dictCodeToEnum = new ConcurrentHashMap<>();

    /** 枚举名 → 运行期新增的合法编码集合 */
    private volatile Map<String, Set<String>> runtime = Collections.emptyMap();

    public EnumCatalog(ResourceDefinitionLoader loader) {
        EnumDefinition definition = loader.loadEnums();
        definition.getEnums().forEach((name, entries) -> {
            builtinLabels.put(name, Collections.unmodifiableMap(new LinkedHashMap<>(entries)));
            builtinCodes.put(name, Collections.unmodifiableSet(new LinkedHashSet<>(entries.keySet())));
        });
        dictCodeToEnum.putAll(definition.getDictCodeToEnum());
    }

    /** 合法取值集合；未知枚举名返回空集（调用方视为"不校验"） */
    public Set<String> allowed(String enumName) {
        if (enumName == null || enumName.isEmpty()) {
            return Collections.emptySet();
        }
        Set<String> result = new LinkedHashSet<>(builtinCodes.getOrDefault(enumName, Collections.emptySet()));
        result.addAll(runtime.getOrDefault(enumName, Collections.emptySet()));
        return result;
    }

    /**
     * @return true 表示合法；白名单为空（未知枚举名）一律放行，避免契约外字段被误拦
     */
    public boolean isValid(String enumName, Object value) {
        if (value == null || String.valueOf(value).trim().isEmpty()) {
            return true;
        }
        Set<String> codes = allowed(enumName);
        return codes.isEmpty() || codes.contains(String.valueOf(value));
    }

    /** 枚举文案；未命中回落到编码本身 */
    public String label(String enumName, Object code) {
        if (code == null) {
            return "";
        }
        Map<String, String> labels = builtinLabels.get(enumName);
        return labels == null ? String.valueOf(code) : labels.getOrDefault(String.valueOf(code), String.valueOf(code));
    }

    /** 刷新运行期白名单（字典变更后调用） */
    public void applyRuntime(Map<String, Set<String>> codes) {
        this.runtime = codes == null
                ? Collections.emptyMap()
                : Collections.unmodifiableMap(new LinkedHashMap<>(codes));
        log.info("运行期枚举白名单已刷新，覆盖 {} 个枚举", runtime.size());
    }

    public Map<String, String> dictBindings() {
        return Collections.unmodifiableMap(dictCodeToEnum);
    }
}
