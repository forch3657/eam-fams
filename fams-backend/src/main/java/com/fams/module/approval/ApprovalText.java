package com.fams.module.approval;

/**
 * 审批模块共用的取值工具：把任意来源的属性安全规约为字符串。
 */
public final class ApprovalText {

    private ApprovalText() {
    }

    public static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    public static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    public static boolean truthy(Object value) {
        if (value == null) {
            return false;
        }
        if (value instanceof Boolean) {
            return (Boolean) value;
        }
        if (value instanceof Number) {
            return ((Number) value).intValue() != 0;
        }
        String textValue = String.valueOf(value).trim();
        return "true".equalsIgnoreCase(textValue) || "1".equals(textValue) || "Y".equalsIgnoreCase(textValue);
    }

    public static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
