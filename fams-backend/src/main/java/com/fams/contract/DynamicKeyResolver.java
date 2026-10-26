package com.fams.contract;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 动态集合 key 解析：运行时新建的字典类型 / 单据列表集合不在导出的静态契约里，
 * 需要在此按模式即时生成元数据。
 *
 * <p>与前端 schema.js 的 CONTRACT_PATTERNS 保持一致。</p>
 */
public final class DynamicKeyResolver {

    private static final String DOC_LIST_PREFIX = "fixed-asset-doc-lists-";

    private static final Pattern DICT_ITEM = Pattern.compile("^system-dict-types-(.+)-items$");

    private DynamicKeyResolver() {
    }

    /** 是否为运行时动态集合（命中模式但静态表里没有） */
    public static boolean isDynamic(String key) {
        return key.startsWith(DOC_LIST_PREFIX) || DICT_ITEM.matcher(key).matches();
    }

    public static ResourceMeta resolve(String key) {
        if (key.startsWith(DOC_LIST_PREFIX)) {
            return docList(key, key.substring(DOC_LIST_PREFIX.length()));
        }
        Matcher m = DICT_ITEM.matcher(key);
        if (m.matches()) {
            return dictItem(key, m.group(1));
        }
        return null;
    }

    /** 固定资产单据列表：8 个 biz 各一张物理表（契约明确要求，不要合并成一张表） */
    private static ResourceMeta docList(String key, String biz) {
        ResourceMeta meta = base(key, "单据列表(" + biz + ")", "id");
        meta.setDynamic(true);
        meta.getFields().add(field("code", "string", true, true, null, null));
        meta.getFields().add(field("name", "string", true, false, null, null));
        meta.getFields().add(field("companyId", "string", false, false, null, "org-companies"));
        meta.getFields().add(field("assetId", "string", true, false, null, "fixed-assets"));
        meta.getFields().add(field("creatorId", "string", false, false, null, "org-users"));
        meta.getFields().add(field("createTime", "date", false, false, null, null));
        meta.getFields().add(field("finishTime", "date", false, false, null, null));
        meta.getFields().add(field("remark", "string", false, false, null, null));
        meta.getFields().add(field("status", "enum", true, false, "DOC_STATUS", null));
        meta.setUniqueFields(Collections.singletonList("code"));
        meta.getRefs().add(ref("companyId", "org-companies"));
        meta.getRefs().add(ref("assetId", "fixed-assets"));
        meta.getRefs().add(ref("creatorId", "org-users"));
        meta.setKeywordFields(java.util.Arrays.asList("code", "name"));
        meta.setFilterFields(java.util.Arrays.asList("status", "companyId"));
        meta.setSortFields(Collections.singletonList("createTime"));
        return meta;
    }

    /**
     * 字典项集合：契约 4.8 表述为「每个字典类型一张表」，此处刻意归一为
     * {@code system_dict_items} + {@code dict_code} 列——因为字典类型可在运行期新增，
     * 按类型建表会导致运行期 DDL。HTTP 契约（路径与字段）完全不变。
     */
    private static ResourceMeta dictItem(String key, String dictCode) {
        ResourceMeta meta = base(key, "字典项", "id");
        meta.setDynamic(true);
        meta.setTable("system_dict_items");
        Map<String, Object> filters = new LinkedHashMap<>();
        filters.put("dictCode", dictCode);
        meta.setFixedFilters(filters);
        meta.getFields().add(field("label", "string", true, false, null, null));
        meta.getFields().add(field("value", "string", true, true, null, null));
        meta.getFields().add(field("sort", "number", false, false, null, null));
        meta.getFields().add(field("status", "enum", true, false, "ENABLE_STATUS", null));
        meta.getFields().add(field("remark", "string", false, false, null, null));
        meta.setUniqueFields(Collections.singletonList("value"));
        meta.setKeywordFields(java.util.Arrays.asList("label", "value"));
        meta.setFilterFields(Collections.singletonList("status"));
        meta.setSortFields(Collections.singletonList("sort"));
        return meta;
    }

    private static ResourceMeta base(String key, String label, String pkField) {
        ResourceMeta meta = new ResourceMeta();
        meta.setKey(key);
        meta.setLabel(label);
        meta.setTable(key.replace('-', '_'));
        meta.setPkField(pkField);
        meta.setIdGenerated("id".equals(pkField));
        meta.setAudit(true);
        return meta;
    }

    private static ResourceMeta.Field field(String name, String type, boolean required, boolean unique,
                                           String enumName, String refCollection) {
        ResourceMeta.Field f = new ResourceMeta.Field();
        f.setName(name);
        f.setType(type);
        f.setRequired(required);
        f.setUnique(unique);
        f.setEnumName(enumName);
        f.setRefCollection(refCollection);
        return f;
    }

    private static ResourceMeta.Ref ref(String field, String collection) {
        ResourceMeta.Ref r = new ResourceMeta.Ref();
        r.setField(field);
        r.setCollection(collection);
        return r;
    }
}
