package com.fams.module.liuxun;

import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;
import com.fams.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 柳讯通讯录 → 本地组织人员「批量预置」。
 *
 * <p>口径（见对接文档第八节）：
 * <ul>
 *   <li>公司/部门/人员从通讯录组织树解析；人员按<b>手机号</b>去重（去 +86- 前缀），
 *       同一人多部门 = 多条 {@code org-user-positions}，主表 {@code org-users} 只建一条。</li>
 *   <li>只建档案：同步来的用户默认 ENABLED（2026-11-24 用户决策），但 role_ids 为空，
 *       需管理员在用户管理补配角色后才能看到数据。</li>
 *   <li>幂等：按归一化手机号匹配既有本地账号（liuxunId 映射列尚未加，先用手机号）。</li>
 *   <li>只增不改：已存在的公司/部门/用户跳过，不覆盖本地手工维护的数据。</li>
 * </ul>
 * </p>
 *
 * <p>真实模式从 {@code GET /api/contacts} 拉组织树、{@code GET /api/user/all} 取手机号；
 * 当前柳讯通讯录接口服务端 500（见文档），会抛出带明确提示的异常。mock 模式返回内置样本。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiuxunSyncService {

    private static final String COMPANIES = "org-companies";
    private static final String DEPARTMENTS = "org-departments";
    private static final String USERS = "org-users";
    private static final String POSITIONS = "org-user-positions";
    private static final String ENABLED = "ENABLED";

    private final GenericService genericService;
    private final LiuxunProperties properties;
    private final LiuxunOAuth2Client oauth2Client;
    private final ObjectMapper objectMapper;
    private volatile RestTemplate restTemplate;

    /** 拉取通讯录并解析为「待预置」计划，不写库。 */
    public Map<String, Object> preview() {
        List<ContactNode> tree = fetchContacts();
        Map<Integer, String> phoneById = loadLiuxunUserPhones();
        ParseResult parsed = flatten(tree, null, null, phoneById);

        LocalIndex local = loadLocalIndex();
        List<Map<String, Object>> companyRows = new ArrayList<>();
        for (String name : parsed.companies) {
            companyRows.add(row("name", name, "action",
                    local.companyIdByName.containsKey(name) ? "SKIP" : "CREATE"));
        }
        List<Map<String, Object>> deptRows = new ArrayList<>();
        for (String key : parsed.deptKeys) {
            String[] p = key.split("\\|\\|", -1);
            deptRows.add(row("companyName", p[0], "name", p[1], "action",
                    local.deptIdByKey.containsKey(key) ? "SKIP" : "CREATE"));
        }
        List<Map<String, Object>> userRows = new ArrayList<>();
        for (ContactPerson person : parsed.uniquePeople) {
            userRows.add(row("phone", person.phone, "name", person.name,
                    "companyName", person.company, "deptName", person.dept,
                    "position", person.position,
                    "action", local.userByPhone.containsKey(person.phone) ? "SKIP" : "CREATE"));
        }
        List<Map<String, Object>> positionRows = new ArrayList<>();
        for (ContactPerson person : parsed.people) {
            positionRows.add(row("phone", person.phone, "name", person.name,
                    "companyName", person.company, "deptName", person.dept,
                    "position", person.position, "primary", person.primary));
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("companyNodes", parsed.companies.size());
        stats.put("deptNodes", parsed.deptKeys.size());
        stats.put("peopleNodes", parsed.people.size());
        stats.put("uniquePeople", parsed.uniquePeople.size());
        stats.put("createCompanies", countAction(companyRows, "CREATE"));
        stats.put("createDepartments", countAction(deptRows, "CREATE"));
        stats.put("createUsers", countAction(userRows, "CREATE"));
        stats.put("skipExistingUsers", countAction(userRows, "SKIP"));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mock", properties.isMock());
        result.put("stats", stats);
        result.put("companies", companyRows);
        result.put("departments", deptRows);
        result.put("users", userRows);
        result.put("positions", positionRows);
        result.put("note", "只建档案并默认启用；角色未分配，需管理员在用户管理中补配角色后才能看到数据。已存在的公司/部门/用户一律跳过。");
        return result;
    }

    /** 执行预置：重新拉一次通讯录（避免用过期预览），公司→部门→用户→岗位顺序写入。 */
    public Map<String, Object> apply() {
        List<ContactNode> tree = fetchContacts();
        Map<Integer, String> phoneById = loadLiuxunUserPhones();
        ParseResult parsed = flatten(tree, null, null, phoneById);
        LocalIndex local = loadLocalIndex();

        int createdCompanies = 0, createdDepartments = 0, createdUsers = 0, createdPositions = 0, skipped = 0;
        List<String> errors = new ArrayList<>();

        for (String name : parsed.companies) {
            if (local.companyIdByName.containsKey(name)) continue;
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("name", name);
                body.put("code", "LX-" + nextSuffix("LX-", local.companyCodes));
                body.put("status", ENABLED);
                Map<String, Object> saved = genericService.create(COMPANIES, body);
                local.companyIdByName.put(name, str(saved.get("id")));
                local.companyCodes.add(str(body.get("code")));
                createdCompanies++;
            } catch (Exception e) {
                errors.add("公司「" + name + "」创建失败：" + e.getMessage());
            }
        }

        for (String key : parsed.deptKeys) {
            String[] p = key.split("\\|\\|", -1);
            String companyName = p[0], name = p[1];
            if (local.deptIdByKey.containsKey(key)) continue;
            String companyId = local.companyIdByName.get(companyName);
            if (companyId == null) {
                errors.add("部门「" + name + "」跳过：公司「" + companyName + "」未就绪");
                continue;
            }
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("name", name);
                body.put("code", "LXD-" + nextSuffix("LXD-", local.deptCodes));
                body.put("companyId", companyId);
                body.put("status", ENABLED);
                Map<String, Object> saved = genericService.create(DEPARTMENTS, body);
                local.deptIdByKey.put(key, str(saved.get("id")));
                local.deptCodes.add(str(body.get("code")));
                createdDepartments++;
            } catch (Exception e) {
                errors.add("部门「" + name + "」创建失败：" + e.getMessage());
            }
        }

        for (ContactPerson person : parsed.uniquePeople) {
            String phone = person.phone;
            if (local.userByPhone.containsKey(phone)) {
                skipped++;
                continue;
            }
            String companyId = local.companyIdByName.get(person.company);
            if (companyId == null) {
                errors.add("用户「" + phone + "」跳过：公司「" + person.company + "」未就绪");
                continue;
            }
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("username", phone);
                body.put("password", randomPassword());
                body.put("name", person.name);
                body.put("companyId", companyId);
                String deptId = local.deptIdByKey.get(person.company + "||" + person.dept);
                if (deptId != null) body.put("deptId", deptId);
                if (!isEmpty(person.position)) body.put("position", person.position);
                body.put("phone", phone);
                body.put("status", ENABLED);
                body.put("roleIds", RowCodec.writeJson(Collections.emptyList()));
                Map<String, Object> saved = genericService.create(USERS, body);
                local.userByPhone.put(phone, str(saved.get("id")));
                createdUsers++;
            } catch (Exception e) {
                errors.add("用户「" + phone + "」创建失败：" + e.getMessage());
            }
        }

        // 每个人员节点一条岗位；兼职（同手机号多节点）会生成多条，第一条为主职
        for (ContactPerson person : parsed.people) {
            String userId = local.userByPhone.get(person.phone);
            if (userId == null) {
                errors.add("岗位「" + person.position + "」跳过：用户「" + person.phone + "」未就绪");
                continue;
            }
            String companyId = local.companyIdByName.get(person.company);
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("userId", userId);
                if (companyId != null) body.put("companyId", companyId);
                String deptId = local.deptIdByKey.get(person.company + "||" + person.dept);
                if (deptId != null) body.put("deptId", deptId);
                if (!isEmpty(person.position)) body.put("position", person.position);
                body.put("isPrimary", person.primary);
                body.put("status", ENABLED);
                genericService.create(POSITIONS, body);
                createdPositions++;
            } catch (Exception e) {
                errors.add("岗位「" + person.position + "」创建失败：" + e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("createdCompanies", createdCompanies);
        result.put("createdDepartments", createdDepartments);
        result.put("createdUsers", createdUsers);
        result.put("createdPositions", createdPositions);
        result.put("skippedExistingUsers", skipped);
        result.put("errors", errors);
        result.put("ok", errors.isEmpty());
        return result;
    }

    /** 按公司批量启用：status != ENABLED 的用户置为 ENABLED。 */
    public Map<String, Object> enableByCompany(String companyId) {
        if (isEmpty(companyId)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "请选择公司");
        }
        Map<String, String[]> query = new LinkedHashMap<>();
        query.put("companyId", new String[]{companyId});
        List<Map<String, Object>> users = genericService.listInternal(USERS, query);
        int enabled = 0, skipped = 0;
        for (Map<String, Object> u : users) {
            if (ENABLED.equalsIgnoreCase(str(u.get("status")))) {
                skipped++;
                continue;
            }
            // update 是全量替换，必须回传整行，否则必填字段校验失败
            Map<String, Object> patch = new LinkedHashMap<>(u);
            patch.put("status", ENABLED);
            Object version = u.get("version");
            if (version != null) patch.put("version", version);
            patch.remove("id");
            genericService.update(USERS, str(u.get("id")), patch);
            enabled++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("companyId", companyId.trim());
        result.put("total", users.size());
        result.put("enabled", enabled);
        result.put("skipped", skipped);
        return result;
    }

    // ------------------------------------------------------------------ 通讯录获取

    private List<ContactNode> fetchContacts() {
        if (properties.isMock()) return mockTree();
        String token = oauth2Client.clientToken().getAccessToken();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        try {
            ResponseEntity<String> response = template().exchange(
                    properties.getBaseUrl() + "/api/contacts", HttpMethod.GET,
                    new HttpEntity<>(headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode all = root.path("allOrgStructureVOs");
            List<ContactNode> nodes = new ArrayList<>();
            if (all.isArray()) {
                for (JsonNode n : all) nodes.add(toNode(n));
            }
            if (nodes.isEmpty()) {
                throw new IllegalStateException("柳讯通讯录返回空组织树；请确认账号权限");
            }
            return nodes;
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯通讯录接口不可用（" + e.getMessage()
                    + "）：实测客户端 token 403 / 用户 token 500，需柳讯方修复该接口", e);
        } catch (Exception e) {
            if (e instanceof IllegalStateException) throw (IllegalStateException) e;
            throw new IllegalStateException("柳讯通讯录解析失败：" + e.getMessage(), e);
        }
    }

    /** 通讯录人员节点只有 objectId（柳讯用户 ID），手机号从 /api/user/all 按 ID 查。 */
    private Map<Integer, String> loadLiuxunUserPhones() {
        Map<Integer, String> phones = new LinkedHashMap<>();
        if (properties.isMock()) {
            phones.put(3001, "13900003001");
            phones.put(3002, "13900003002");
            return phones;
        }
        String token = oauth2Client.clientToken().getAccessToken();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        try {
            ResponseEntity<String> response = template().exchange(
                    properties.getBaseUrl() + "/api/user/all", HttpMethod.GET,
                    new HttpEntity<>(headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode list = root.path("result");
            if (list.isArray()) {
                for (JsonNode u : list) {
                    int id = u.path("id").asInt(-1);
                    String phone = normalizePhone(u.path("userName").asText(""));
                    if (id > 0 && !phone.isEmpty()) phones.put(id, phone);
                }
            }
            return phones;
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯用户列表接口不可用：" + e.getMessage(), e);
        } catch (Exception e) {
            if (e instanceof IllegalStateException) throw (IllegalStateException) e;
            throw new IllegalStateException("柳讯用户列表解析失败：" + e.getMessage(), e);
        }
    }

    private ContactNode toNode(JsonNode n) {
        ContactNode node = new ContactNode();
        node.id = n.path("id").asInt();
        node.objectId = n.path("objectId").asInt();
        node.type = n.path("type").asInt();
        node.name = n.path("name").asText("");
        node.postName = n.path("postName").asText("");
        JsonNode children = n.path("childrenOrgStructures");
        if (children.isArray()) {
            for (JsonNode c : children) node.children.add(toNode(c));
        }
        return node;
    }

    private List<ContactNode> mockTree() {
        ContactNode group = company(1, 1001, "示例集团（mock）");
        ContactNode research = company(2, 1002, "示例研究院（mock）");
        group.children.add(research);
        ContactNode deptA = dept(3, 2001, "研发部", 2);
        ContactNode deptB = dept(4, 2002, "市场部", 2);
        research.children.add(deptA);
        research.children.add(deptB);
        deptA.children.add(person(5, 3001, "张三（mock）", "研发工程师"));
        deptB.children.add(person(6, 3002, "李四（mock）", "市场经理"));
        deptA.children.add(person(7, 3002, "李四（mock）", "研发兼职"));
        return Collections.singletonList(group);
    }

    private static ContactNode company(int id, int objectId, String name) {
        ContactNode n = new ContactNode();
        n.id = id; n.objectId = objectId; n.type = 1; n.name = name;
        return n;
    }

    private static ContactNode dept(int id, int objectId, String name, int parentId) {
        ContactNode n = new ContactNode();
        n.id = id; n.objectId = objectId; n.type = 2; n.name = name; n.parentId = parentId;
        return n;
    }

    private static ContactNode person(int id, int objectId, String name, String postName) {
        ContactNode n = new ContactNode();
        n.id = id; n.objectId = objectId; n.type = 3; n.name = name;
        n.postName = postName;
        return n;
    }

    /** 递归展开；人员节点用遍历时的公司/部门上下文，天然支持一人多部门。 */
    private ParseResult flatten(List<ContactNode> nodes, String companyName, String deptName,
                                Map<Integer, String> phoneById) {
        ParseResult out = new ParseResult();
        walk(nodes, companyName, deptName, phoneById, out);
        // 按手机号去重：第一处为主职，其余节点保留为岗位但不再建用户
        Set<String> seen = new LinkedHashSet<>();
        for (ContactPerson p : out.people) {
            if (isEmpty(p.phone)) continue;
            if (seen.add(p.phone)) {
                p.primary = true;
                out.uniquePeople.add(p);
            }
        }
        return out;
    }

    private void walk(List<ContactNode> nodes, String companyName, String deptName,
                      Map<Integer, String> phoneById, ParseResult out) {
        for (ContactNode n : nodes) {
            if (n.type == 1) {
                out.companies.add(n.name);
                for (ContactNode c : n.children) {
                    if (c.type == 1) {
                        walk(Collections.singletonList(c), c.name, null, phoneById, out);
                    } else {
                        walk(Collections.singletonList(c), n.name, null, phoneById, out);
                    }
                }
            } else if (n.type == 2) {
                out.deptKeys.add(companyName + "||" + n.name);
                for (ContactNode c : n.children) {
                    if (c.type == 2) {
                        walk(Collections.singletonList(c), companyName, c.name, phoneById, out);
                    } else {
                        walk(Collections.singletonList(c), companyName, n.name, phoneById, out);
                    }
                }
            } else if (n.type == 3) {
                String phone = normalizePhone(phoneById.get(n.objectId));
                if (isEmpty(phone)) continue;
                ContactPerson p = new ContactPerson();
                p.phone = phone;
                p.name = n.name;
                p.company = companyName == null ? "" : companyName;
                p.dept = deptName == null ? "" : deptName;
                p.position = n.postName;
                p.primary = false; // 下方按首次出现置主职
                out.people.add(p);
            }
        }
    }

    private LocalIndex loadLocalIndex() {
        LocalIndex index = new LocalIndex();
        for (Map<String, Object> c : genericService.listInternal(COMPANIES, Collections.emptyMap())) {
            index.companyIdByName.put(str(c.get("name")), str(c.get("id")));
            index.companyCodes.add(str(c.get("code")));
        }
        for (Map<String, Object> d : genericService.listInternal(DEPARTMENTS, Collections.emptyMap())) {
            index.deptIdByKey.put(str(d.get("companyId")) + "||" + str(d.get("name")), str(d.get("id")));
            index.deptCodes.add(str(d.get("code")));
        }
        for (Map<String, Object> u : genericService.listInternal(USERS, Collections.emptyMap())) {
            String phone = normalizePhone(str(u.get("phone")));
            if (isEmpty(phone)) phone = normalizePhone(str(u.get("username")));
            if (!isEmpty(phone)) index.userByPhone.put(phone, str(u.get("id")));
        }
        return index;
    }

    private RestTemplate template() {
        if (restTemplate == null) {
            synchronized (this) {
                if (restTemplate == null) {
                    SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
                    f.setConnectTimeout(properties.getConnectTimeout());
                    f.setReadTimeout(properties.getReadTimeout());
                    restTemplate = new RestTemplate(f);
                }
            }
        }
        return restTemplate;
    }

    // ------------------------------------------------------------------ helpers

    private static String normalizePhone(String s) {
        return String.valueOf(s == null ? "" : s).replaceAll("^\\+86[- ]?", "").trim();
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static boolean isEmpty(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static int countAction(List<Map<String, Object>> rows, String action) {
        int n = 0;
        for (Map<String, Object> r : rows) if (action.equals(r.get("action"))) n++;
        return n;
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
        return m;
    }

    private static String nextSuffix(String prefix, Collection<String> codes) {
        long max = 0;
        for (String code : codes) {
            if (code != null && code.startsWith(prefix)) {
                String tail = code.substring(prefix.length());
                if (tail.matches("\\d+")) max = Math.max(max, Long.parseLong(tail));
            }
        }
        return String.format("%04d", max + 1);
    }

    private static String randomPassword() {
        String chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
        StringBuilder sb = new StringBuilder("Lx");
        java.security.SecureRandom r = new java.security.SecureRandom();
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(r.nextInt(chars.length())));
        return sb.toString();
    }

    private static class ContactNode {
        int id, objectId, parentId, type;
        String name = "", postName = "";
        final List<ContactNode> children = new ArrayList<>();
    }

    private static class ContactPerson {
        String phone, name, company, dept, position;
        boolean primary;
    }

    private static class ParseResult {
        final Set<String> companies = new LinkedHashSet<>();
        final Set<String> deptKeys = new LinkedHashSet<>();
        final List<ContactPerson> people = new ArrayList<>();
        final List<ContactPerson> uniquePeople = new ArrayList<>();
    }

    private static class LocalIndex {
        final Map<String, String> companyIdByName = new LinkedHashMap<>();
        final Map<String, String> deptIdByKey = new LinkedHashMap<>();
        final Map<String, String> userByPhone = new LinkedHashMap<>();
        final Set<String> companyCodes = new LinkedHashSet<>();
        final Set<String> deptCodes = new LinkedHashSet<>();
    }
}
