package com.fams.contract;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 枚举定义 + 字典绑定关系（由前端 constants/enums.js 导出）。
 */
public class EnumDefinition {

    /** 枚举名 → {编码 → 文案} */
    private final Map<String, Map<String, String>> enums = new HashMap<>();

    /** 字典类型 code → 枚举名 */
    private final Map<String, String> dictCodeToEnum = new LinkedHashMap<>();

    /** 字典类型 code → 中文名 */
    private final Map<String, String> dictCodeToLabel = new LinkedHashMap<>();

    public EnumDefinition(Map<String, Map<String, String>> enums, List<Map<String, String>> dictMeta) {
        if (enums != null) {
            this.enums.putAll(enums);
        }
        List<Map<String, String>> safeMeta = dictMeta == null ? new ArrayList<Map<String, String>>() : dictMeta;
        for (Map<String, String> item : safeMeta) {
            String code = item.get("code");
            String enumName = item.get("enumName");
            if (code != null && enumName != null) {
                this.dictCodeToEnum.put(code, enumName);
                this.dictCodeToLabel.put(code, item.get("label"));
            }
        }
    }

    public Map<String, Map<String, String>> getEnums() {
        return enums;
    }

    public Map<String, String> getDictCodeToEnum() {
        return dictCodeToEnum;
    }

    public Map<String, String> getDictCodeToLabel() {
        return dictCodeToLabel;
    }

    @Override
    public String toString() {
        return "EnumDefinition{enums=" + enums.keySet() + ", dictBindings=" + dictCodeToEnum.size() + '}';
    }
}
