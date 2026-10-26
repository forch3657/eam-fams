package com.fams.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * 命名转换：契约字段为 camelCase，物理列为 snake_case。
 */
public final class Names {

    private Names() {
    }

    public static String camelToSnake(String name) {
        if (name == null || name.isEmpty()) {
            return name;
        }
        StringBuilder sb = new StringBuilder(name.length() + 8);
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (Character.isUpperCase(c)) {
                sb.append('_').append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /** 批量转换：契约字段名列表 → 物理列名列表 */
    public static List<String> camelToSnakeList(List<String> names) {
        List<String> out = new ArrayList<>(names.size());
        for (String name : names) {
            out.add(camelToSnake(name));
        }
        return out;
    }

    public static String snakeToCamel(String name) {
        if (name == null || name.isEmpty()) {
            return name;
        }
        StringBuilder sb = new StringBuilder(name.length());
        boolean upperNext = false;
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '_') {
                upperNext = true;
            } else if (upperNext) {
                sb.append(Character.toUpperCase(c));
                upperNext = false;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
