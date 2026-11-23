package com.fams.module.liuxun;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;

/** 柳讯用户信息（授权码模式 account_info / GET /api/user/query result）。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LiuxunAccount {

    /** 柳讯用户 ID，待办 userIds/createUserId 要用 */
    private long id;

    /** 用户名，即手机号 → 本地 username */
    private String userName;

    /** 姓名 → 本地 name */
    private String realName;

    /** 手机号 → 本地 phone */
    private String telephone;

    private String avatar;

    private String email;

    /** 从 account_info Map 转换，缺字段留空，不抛错 */
    public static LiuxunAccount from(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return null;
        }
        LiuxunAccount a = new LiuxunAccount();
        Object id = map.get("id");
        a.setId(id == null ? 0L : (id instanceof Number ? ((Number) id).longValue() : Long.parseLong(String.valueOf(id))));
        a.setUserName(text(map.get("userName")));
        a.setRealName(text(map.get("realName")));
        a.setTelephone(text(map.get("telephone")));
        a.setAvatar(text(map.get("avatar")));
        a.setEmail(text(map.get("email")));
        return a;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new HashMap<>();
        map.put("id", id);
        map.put("userName", userName);
        map.put("realName", realName);
        map.put("telephone", telephone);
        map.put("avatar", avatar);
        map.put("email", email);
        return map;
    }

    private static String text(Object v) {
        return v == null ? "" : String.valueOf(v);
    }
}
