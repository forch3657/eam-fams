package com.fams.engine;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 集合 → 权限码策略（契约 7.3）。
 *
 * <p>契约只给出 36 个权限码清单，未规定"集合 ↔ 权限码"的映射，
 * 这里按前端菜单的最小粒度定义：
 * 读 → xx:view（低值为 lv:view），写 → 模块对应的操作码。
 * 未登记的集合仅要求已登录（不做细粒度鉴权）。</p>
 */
@Slf4j
@Component
public class PermissionPolicy {

    /** 集合 key 前缀 → { 读, 写, 删 } 权限码 */
    private static final Map<String, String[]> READ = new HashMap<>();

    private static final Map<String, String[]> WRITE = new HashMap<>();

    private static final Map<String, String[]> DELETE = new HashMap<>();

    static {
        READ.put("fixed-assets", new String[]{"fa:view"});
        WRITE.put("fixed-assets", new String[]{"fa:add", "fa:edit"});
        DELETE.put("fixed-assets", new String[]{"fa:delete"});

        READ.put("fixed-asset-reports", new String[]{"fa:report"});
        READ.put("fixed-asset-settings", new String[]{"fa:edit"});
        WRITE.put("fixed-asset-settings", new String[]{"fa:edit"});
        DELETE.put("fixed-asset-settings", new String[]{"fa:edit"});

        READ.put("fixed-asset-doc-lists", new String[]{"fa:view"});
        WRITE.put("fixed-asset-doc-lists", new String[]{"fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists", new String[]{"fa:edit"});

        READ.put("fixed-asset-inventory", new String[]{"fa:inventory"});
        WRITE.put("fixed-asset-inventory", new String[]{"fa:inventory"});
        DELETE.put("fixed-asset-inventory", new String[]{"fa:inventory"});

        READ.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});
        WRITE.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});
        DELETE.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});

        READ.put("low-value", new String[]{"lv:view"});
        WRITE.put("low-value", new String[]{"lv:edit"});
        DELETE.put("low-value", new String[]{"lv:edit"});

        // org-companies / org-departments / org-roles 的「读」故意不登记权限码：
        // 前端路由守卫与 can() 判定都要先加载组织主数据，如果普通业务角色读不到，
        // 任何非管理员账号登录后都会被守卫拦在登录页（表现为"登录成功但不跳转"）。
        // 公司/部门/角色属于全局基础字典，写操作仍分别要求 org:company / org:dept / org:role。
        WRITE.put("org-companies", new String[]{"org:company"});
        DELETE.put("org-companies", new String[]{"org:company"});

        WRITE.put("org-departments", new String[]{"org:dept"});
        DELETE.put("org-departments", new String[]{"org:dept"});

        READ.put("org-users", new String[]{"org:user"});
        WRITE.put("org-users", new String[]{"org:user"});
        DELETE.put("org-users", new String[]{"org:user"});

        WRITE.put("org-roles", new String[]{"org:role"});
        DELETE.put("org-roles", new String[]{"org:role"});

        READ.put("system-dict", new String[]{"sys:dict"});
        WRITE.put("system-dict", new String[]{"sys:dict"});
        DELETE.put("system-dict", new String[]{"sys:dict"});

        READ.put("system-params", new String[]{"sys:params"});
        WRITE.put("system-params", new String[]{"sys:params"});
        DELETE.put("system-params", new String[]{"sys:params"});

        READ.put("system-workflow", new String[]{"sys:workflow"});
        WRITE.put("system-workflow", new String[]{"sys:workflow"});
        DELETE.put("system-workflow", new String[]{"sys:workflow"});

        READ.put("system-terminal", new String[]{"sys:terminal"});
        WRITE.put("system-terminal", new String[]{"sys:terminal"});
        DELETE.put("system-terminal", new String[]{"sys:terminal"});

        READ.put("notify-messages", new String[]{"sys:message"});
        WRITE.put("notify-messages", new String[]{"sys:message"});
        DELETE.put("notify-messages", new String[]{"sys:message"});

        READ.put("notify-templates", new String[]{"sys:template"});
        WRITE.put("notify-templates", new String[]{"sys:template"});
        DELETE.put("notify-templates", new String[]{"sys:template"});

        READ.put("operation-logs", new String[]{"sys:log"});
        WRITE.put("operation-logs", new String[]{"sys:log"});
        DELETE.put("operation-logs", new String[]{"sys:log"});
    }

    /**
     * @return 访问该集合所需权限码；null 表示只需登录
     */
    public String requiredPermission(String key, String method) {
        Map<String, String[]> table = WRITE;
        if ("GET".equalsIgnoreCase(method)) {
            table = READ;
        } else if ("DELETE".equalsIgnoreCase(method)) {
            table = DELETE;
        }
        String[] codes = lookup(table, key);
        return codes == null || codes.length == 0 ? null : codes[0];
    }

    /** 权限码判定：任一命中即通过 */
    public boolean matches(String key, String method, java.util.Set<String> granted) {
        String required = requiredPermission(key, method);
        if (required == null) {
            return true;
        }
        // 写操作的多个候选码（新增/编辑）任一命中即可
        Map<String, String[]> table = "GET".equalsIgnoreCase(method) ? READ
                : "DELETE".equalsIgnoreCase(method) ? DELETE : WRITE;
        String[] codes = lookup(table, key);
        if (codes == null) {
            return true;
        }
        for (String code : codes) {
            if (granted.contains(code)) {
                return true;
            }
        }
        return false;
    }

    private static String[] lookup(Map<String, String[]> table, String key) {
        String[] exact = table.get(key);
        if (exact != null) {
            return exact;
        }
        String best = null;
        String[] bestCodes = null;
        for (Map.Entry<String, String[]> entry : table.entrySet()) {
            if (key.startsWith(entry.getKey())
                    && (best == null || entry.getKey().length() > best.length())) {
                best = entry.getKey();
                bestCodes = entry.getValue();
            }
        }
        return bestCodes;
    }
}
