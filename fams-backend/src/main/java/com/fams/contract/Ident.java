package com.fams.contract;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;

import java.util.regex.Pattern;

/**
 * SQL 标识符校验。
 *
 * <p>通用引擎的表名/列名只能在运行时拼进 SQL，因此所有标识符必须来自元数据白名单，
 * 并在此做形式校验；任何来自请求参数的字符串都不得直接作为标识符使用。</p>
 */
public final class Ident {

    private static final Pattern SAFE = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,63}");

    private Ident() {
    }

    public static String check(String name) {
        if (name == null || !SAFE.matcher(name).matches()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "非法的数据标识符：" + name);
        }
        return name;
    }

    /** 反引号包裹的标识符（MySQL / H2 MySQL 模式均支持） */
    public static String q(String name) {
        return "`" + check(name) + "`";
    }

    /** 逗号分隔的标识符列表 */
    public static String join(Iterable<String> names) {
        StringBuilder sb = new StringBuilder();
        for (String name : names) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(q(name));
        }
        return sb.toString();
    }
}
