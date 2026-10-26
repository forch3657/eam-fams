package com.fams.contract;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 契约加载器：读取由前端 schema.js 导出的 resources.json / enums.json。
 *
 * <p>后端不复制字段定义，只消费同一份契约，避免前后端契约漂移。</p>
 */
@Slf4j
@Component
public class ResourceDefinitionLoader {

    private static final String RESOURCES = "contract/resources.json";
    private static final String ENUMS = "contract/enums.json";

    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY, true)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** 加载全部集合元数据（含已解析的动态集合） */
    public List<ResourceMeta> loadResources() {
        Map<String, Object> root = readMap(RESOURCES);
        Object raw = root.get("resources");
        if (!(raw instanceof List)) {
            throw new IllegalStateException("契约文件格式错误：缺少 resources 数组（" + RESOURCES + "）");
        }
        List<ResourceMeta> list = mapper.convertValue(raw, new TypeReference<List<ResourceMeta>>() { });
        log.info("已加载契约集合 {} 个", list.size());
        return list == null ? new ArrayList<>() : list;
    }

    /** 加载枚举定义与「字典类型 → 枚举名」绑定表 */
    public EnumDefinition loadEnums() {
        Map<String, Object> root = readMap(ENUMS);
        Object rawEnums = root.get("enums");
        Object rawMeta = root.get("dictMeta");
        Map<String, Map<String, String>> enums = mapper.convertValue(
                rawEnums, new TypeReference<Map<String, Map<String, String>>>() { });
        List<Map<String, String>> meta = mapper.convertValue(
                rawMeta, new TypeReference<List<Map<String, String>>>() { });
        if (enums == null) enums = new HashMap<>();
        if (meta == null) meta = Collections.emptyList();
        log.info("已加载枚举 {} 个，字典绑定 {} 条", enums.size(), meta.size());
        return new EnumDefinition(enums, meta);
    }

    private Map<String, Object> readMap(String path) {
        ClassPathResource resource = new ClassPathResource(path);
        if (!resource.exists()) {
            throw new IllegalStateException("缺少契约文件：" + path + "。请先执行 cd fams-frontend && npm run export:contract");
        }
        try (InputStream in = resource.getInputStream()) {
            return mapper.readValue(in, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            throw new IllegalStateException("契约文件解析失败：" + path, e);
        }
    }
}
