package com.fams.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

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
        // 资产基础配置（位置 / 分类 / 折旧规则与方案）是独立职责，用 fa:settings 单列，
        // 不再借用 fa:edit —— 否则所有能编辑资产的人都能改基础配置。
        READ.put("fixed-asset-settings", new String[]{"fa:settings"});
        WRITE.put("fixed-asset-settings", new String[]{"fa:settings"});
        DELETE.put("fixed-asset-settings", new String[]{"fa:settings"});

        // 折旧「配置」是基础字典：能看到资产台账（fa:view）的账号就必须能读到方案/规则，
        // 否则折旧台账匹配不到方案，整页显示「未配置」（普通业务角色曾因此全部空白）。
        // 精确 key 优先于上面的 fixed-asset-depreciation / fixed-asset-settings 前缀规则；
        // 增删改与计提动作仍分别要求 fa:depreciation / fa:edit。
        READ.put("fixed-asset-depreciation-schemes", new String[]{"fa:view"});
        READ.put("fixed-asset-settings-depreciation-plans", new String[]{"fa:view"});
        READ.put("fixed-asset-settings-depreciation-rules", new String[]{"fa:view"});

        READ.put("fixed-asset-doc-lists", new String[]{"fa:view"});
        WRITE.put("fixed-asset-doc-lists", new String[]{"fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists", new String[]{"fa:edit"});

        // 固资单据按页签维度补充权限码：前端「新增单据」按 fa:inbound / fa:dispatch / fa:borrow /
        // fa:change / fa:dispose 显示（见 FixedAssetManagement 的 :perm），后端若只认 fa:add/fa:edit，
        // 会出现「按钮可见但保存 403」。这里用「模块码 或 旧码」任一命中，兼容既有角色。
        WRITE.put("fixed-asset-doc-lists-inbound", new String[]{"fa:inbound", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-inbound", new String[]{"fa:inbound", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-alloc", new String[]{"fa:dispatch", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-alloc", new String[]{"fa:dispatch", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-back", new String[]{"fa:dispatch", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-back", new String[]{"fa:dispatch", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-borrow", new String[]{"fa:borrow", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-borrow", new String[]{"fa:borrow", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-change", new String[]{"fa:change", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-change", new String[]{"fa:change", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-transfer", new String[]{"fa:dispose", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-transfer", new String[]{"fa:dispose", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-repair", new String[]{"fa:dispose", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-repair", new String[]{"fa:dispose", "fa:edit"});
        WRITE.put("fixed-asset-doc-lists-dispose", new String[]{"fa:dispose", "fa:add", "fa:edit"});
        DELETE.put("fixed-asset-doc-lists-dispose", new String[]{"fa:dispose", "fa:edit"});

        // 盘点单 / 盘点计划是「被审计的对象」：读随 fa:view（审计员 R6 只有只读码，
        // 读不到盘点单就等于盲批「审计抽查确认」环节）；写与删仍要 fa:inventory（盘点执行权）。
        READ.put("fixed-asset-inventory", new String[]{"fa:inventory", "fa:view"});
        WRITE.put("fixed-asset-inventory", new String[]{"fa:inventory"});
        DELETE.put("fixed-asset-inventory", new String[]{"fa:inventory"});

        READ.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});
        WRITE.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});
        DELETE.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});

        READ.put("low-value", new String[]{"lv:view"});
        WRITE.put("low-value", new String[]{"lv:edit"});
        DELETE.put("low-value", new String[]{"lv:edit"});

        // 低值三类单据同样按模块码放行：前端「新增入库/领用/退库」分别看 lv:inbound /
        // lv:requisition / lv:return（见 LowValueAssetManagement），部门主管只有 lv:requisition，
        // 若后端统一要求 lv:edit，就会重演「新增领用 → 无权限访问该数据：low-value-requisition」。
        WRITE.put("low-value-inbound", new String[]{"lv:inbound", "lv:edit"});
        DELETE.put("low-value-inbound", new String[]{"lv:inbound", "lv:edit"});
        WRITE.put("low-value-requisition", new String[]{"lv:requisition", "lv:edit"});
        DELETE.put("low-value-requisition", new String[]{"lv:requisition", "lv:edit"});
        WRITE.put("low-value-return", new String[]{"lv:return", "lv:edit"});
        DELETE.put("low-value-return", new String[]{"lv:return", "lv:edit"});

        // 低值基础配置（存放位置）：维护需要 lv:settings，但「读」保持 lv:view ——
        // 低值物品表单与领用/入库的存放位置下拉都依赖它，收紧会让普通业务表单变空。
        READ.put("low-value-settings", new String[]{"lv:view"});
        WRITE.put("low-value-settings", new String[]{"lv:settings"});
        DELETE.put("low-value-settings", new String[]{"lv:settings"});

        // org-companies / org-departments / org-roles 的「读」故意不登记权限码：
        // 前端路由守卫与 can() 判定都要先加载组织主数据，如果普通业务角色读不到，
        // 任何非管理员账号登录后都会被守卫拦在登录页（表现为"登录成功但不跳转"）。
        // 公司/部门/角色属于全局基础字典，写操作仍分别要求 org:company / org:dept / org:role。
        WRITE.put("org-companies", new String[]{"org:company"});
        DELETE.put("org-companies", new String[]{"org:company"});

        WRITE.put("org-departments", new String[]{"org:dept"});
        DELETE.put("org-departments", new String[]{"org:dept"});

        // 工作台待办需要用用户列表解析审批人，具备 wm:todo 的角色必须能读，
        // 否则非管理员的审批人待办恒为空（P3-D1）。
        READ.put("org-users", new String[]{"org:user", "wm:todo"});
        WRITE.put("org-users", new String[]{"org:user"});
        DELETE.put("org-users", new String[]{"org:user"});

        WRITE.put("org-roles", new String[]{"org:role"});
        DELETE.put("org-roles", new String[]{"org:role"});

        READ.put("system-dict", new String[]{"sys:dict"});
        WRITE.put("system-dict", new String[]{"sys:dict"});
        DELETE.put("system-dict", new String[]{"sys:dict"});

        // 编号前缀/预警阈值/盘点提醒被业务页面消费，凡是能看工作台的账号都需要读；
        // 写仍然只允许 sys:params。
        READ.put("system-params", new String[]{"sys:params", "wm:view"});
        WRITE.put("system-params", new String[]{"sys:params"});
        DELETE.put("system-params", new String[]{"sys:params"});

        // 读流程配置是算待办的前置条件；写配置仍只允许 sys:workflow（P3-D1）。
        READ.put("system-workflow", new String[]{"sys:workflow", "wm:todo"});
        WRITE.put("system-workflow", new String[]{"sys:workflow"});
        DELETE.put("system-workflow", new String[]{"sys:workflow"});

        READ.put("system-terminal", new String[]{"sys:terminal"});
        WRITE.put("system-terminal", new String[]{"sys:terminal"});
        DELETE.put("system-terminal", new String[]{"sys:terminal"});

        // 「我的消息」按 wm:message 开放读；审批人（wm:todo）需要推送审批结果通知，
        // 写接口对 wm:todo 开放，避免业务角色审批后 403（消息内容仍由服务端可审计）。
        READ.put("notify-messages", new String[]{"sys:message", "wm:message"});
        WRITE.put("notify-messages", new String[]{"sys:message", "wm:todo"});
        DELETE.put("notify-messages", new String[]{"sys:message"});

        READ.put("notify-templates", new String[]{"sys:template", "wm:message"});
        WRITE.put("notify-templates", new String[]{"sys:template"});
        DELETE.put("notify-templates", new String[]{"sys:template"});

        READ.put("operation-logs", new String[]{"sys:log"});
        WRITE.put("operation-logs", new String[]{"sys:log"});
        DELETE.put("operation-logs", new String[]{"sys:log"});
    }

    /** 契约文件是否加载成功（false 时使用 static 内置默认映射） */
    private volatile boolean contractLoaded = false;

    /** 未知集合只告警一次，避免通用 CRUD 高频请求刷爆日志 */
    private final Set<String> warnedUnknown = ConcurrentHashMap.newKeySet();

    /**
     * 启动时加载权限契约。
     *
     * <p>契约是前后端共用的单一事实来源：前端 `permissionMatrix` 与 `check:perm`
     * 读同一份文件，后端也读它，避免「前端按钮可见、后端 403」再次发生。
     * 加载失败不阻断启动，退回 static 内置映射并告警（保留可用性）。</p>
     */
    @PostConstruct
    public void loadContract() {
        try (InputStream in = new ClassPathResource("contract/permission-resources.json").getInputStream()) {
            JsonNode root = new ObjectMapper().readTree(in);
            Map<String, String[]> read = new HashMap<>();
            Map<String, String[]> write = new HashMap<>();
            Map<String, String[]> delete = new HashMap<>();
            for (JsonNode rule : root.path("rules")) {
                String resource = rule.path("resource").asText("");
                if (resource.isEmpty()) {
                    continue;
                }
                putIfPresent(read, resource, rule.get("read"));
                putIfPresent(write, resource, rule.get("write"));
                putIfPresent(delete, resource, rule.get("delete"));
            }
            if (read.isEmpty() && write.isEmpty() && delete.isEmpty()) {
                throw new IllegalStateException("契约未解析出任何规则");
            }
            READ.clear();
            READ.putAll(read);
            WRITE.clear();
            WRITE.putAll(write);
            DELETE.clear();
            DELETE.putAll(delete);
            IMMUTABLE.clear();
            for (JsonNode item : root.path("immutable")) {
                IMMUTABLE.add(item.asText());
            }
            contractLoaded = true;
            log.info("[permission] 权限契约已加载：read={} write={} delete={} immutable={}",
                    READ.size(), WRITE.size(), DELETE.size(), IMMUTABLE.size());
        } catch (Exception e) {
            log.warn("[permission] 权限契约加载失败，退回内置默认映射：{}", e.getMessage());
        }
    }

    private void putIfPresent(Map<String, String[]> table, String resource, JsonNode codes) {
        if (codes == null || !codes.isArray() || codes.size() == 0) {
            return;
        }
        String[] values = new String[codes.size()];
        for (int i = 0; i < codes.size(); i++) {
            values[i] = codes.get(i).asText();
        }
        table.put(resource, values);
    }

    public boolean isContractLoaded() {
        return contractLoaded;
    }

    /**
     * 集合完全未登记时告警：新增业务集合后忘配权限码，会静默变成「仅需登录」。
     */
    private void warnIfUnknown(String key) {
        if (key == null || key.isEmpty() || IMMUTABLE.contains(key)) {
            return;
        }
        if (lookup(READ, key) != null || lookup(WRITE, key) != null || lookup(DELETE, key) != null) {
            return;
        }
        if (warnedUnknown.add(key)) {
            log.warn("[permission] 集合 {} 未在权限契约中登记，按「仅需登录」处理", key);
        }
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

    /** 只读集合：任何账号都不能通过通用 CRUD 改写（审批留痕防篡改，P3-D2） */
    private static final java.util.Set<String> IMMUTABLE = new java.util.HashSet<>(
            Collections.singletonList("fixed-asset-doc-approvals"));

    /** 权限码判定：任一命中即通过 */
    public boolean matches(String key, String method, java.util.Set<String> granted) {
        warnIfUnknown(key);
        if (IMMUTABLE.contains(key) && !"GET".equalsIgnoreCase(method)) {
            return false;
        }
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
