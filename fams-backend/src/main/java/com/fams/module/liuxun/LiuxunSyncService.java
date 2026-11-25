package com.fams.module.liuxun;

import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;
import com.fams.security.AuthContext;
import com.fams.common.ApiException;
import com.fams.imports.OrgStructureImportService;
import org.springframework.web.multipart.MultipartFile;
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
 * <p>真实模式从 {@code GET /api/contacts} 拉组织树（柳讯 2026-11-24 修复后可用，
     * 但需用户 token，见 {@link #fetchContacts}）、{@code GET /api/user/all} 取手机号。
     * mock 模式返回内置样本。</p>
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
    private final OrgStructureImportService orgImportService;
    private volatile RestTemplate restTemplate;

    /** 拉取通讯录并解析为「待预置」计划，不写库。 */
    public Map<String, Object> preview(String liuxunPhone, String liuxunPassword) {
        List<ContactNode> tree = fetchContacts(liuxunPhone, liuxunPassword);
        Map<Integer, String> phoneById = loadLiuxunUserPhones();
        ParseResult parsed = flatten(tree, null, null, phoneById);

        LocalIndex local = loadLocalIndex();
        List<Map<String, Object>> companyRows = new ArrayList<>();
        for (String name : parsed.companies) {
            companyRows.add(row("name", name,
                    "parentName", isEmpty(parsed.companyParent.get(name)) ? "（集团本级）" : parsed.companyParent.get(name),
                    "action", local.companyIdByName.containsKey(name) ? "SKIP" : "CREATE"));
        }
        List<Map<String, Object>> deptRows = new ArrayList<>();
        for (String key : parsed.deptKeys) {
            String[] p = key.split("\\|\\|", -1);
            String parentKey = parsed.deptParent.get(key);
            String parentName = isEmpty(parentKey) ? "" : parentKey.split("\\|\\|", -1)[1];
            deptRows.add(row("companyName", p[0], "name", p[1], "parentName", parentName,
                    "action", local.deptIdByCompanyNameKey.containsKey(key) ? "SKIP" : "CREATE"));
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
    public Map<String, Object> apply(String liuxunPhone, String liuxunPassword) {
        List<ContactNode> tree = fetchContacts(liuxunPhone, liuxunPassword);
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
                String parentName = parsed.companyParent.get(name);
                if (!isEmpty(parentName)) {
                    String parentId = local.companyIdByName.get(parentName);
                    if (isEmpty(parentId)) {
                        errors.add("公司「" + name + "」跳过：上级公司「" + parentName + "」未就绪");
                        continue;
                    }
                    body.put("parentId", parentId);
                }
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
            // 幂等判断必须和通讯录树同口径（公司名||部门名），否则每次都重复建
            if (local.deptIdByCompanyNameKey.containsKey(key)) continue;
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
                String parentKey = parsed.deptParent.get(key);
                if (!isEmpty(parentKey)) {
                    String parentId = local.deptIdByCompanyNameKey.get(parentKey);
                    if (isEmpty(parentId)) {
                        errors.add("部门「" + companyName + "/" + name + "」跳过：上级部门未就绪");
                        continue;
                    }
                    body.put("parentId", parentId);
                }
                Map<String, Object> saved = genericService.create(DEPARTMENTS, body);
                local.deptIdByCompanyNameKey.put(key, str(saved.get("id")));
                local.deptIdByKey.put(companyId + "||" + name, str(saved.get("id")));
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
                String deptId = local.deptIdByCompanyNameKey.get(person.company + "||" + person.dept);
                if (!isEmpty(deptId)) body.put("deptId", deptId);
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
            String deptId = local.deptIdByCompanyNameKey.get(person.company + "||" + person.dept);
            String position = isEmpty(person.position) ? "" : person.position;
            String deptPart = positionKey(userId, companyId == null ? "" : companyId,
                    isEmpty(deptId) ? "" : deptId, "");
            // 岗位幂等：同一(用户,公司,部门,岗位名)只建一条；重复 apply 不得产生兼职副本
            String posKey = positionKey(userId, companyId == null ? "" : companyId,
                    isEmpty(deptId) ? "" : deptId, position);
            if (local.positionKeys.contains(posKey)) continue;
            // 柳讯同一人同部门会有多个节点，其中一个没填岗位名；已有该部门岗位时不再建空岗位名副本
            if (isEmpty(position) && local.positionDeptKeys.contains(deptPart)) continue;
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("userId", userId);
                if (companyId != null) body.put("companyId", companyId);
                if (!isEmpty(deptId)) body.put("deptId", deptId);
                if (!isEmpty(position)) body.put("position", position);
                body.put("isPrimary", person.primary);
                body.put("status", ENABLED);
                genericService.create(POSITIONS, body);
                local.positionKeys.add(posKey);
                local.positionDeptKeys.add(deptPart);
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

    /**
     * 只预置组织（公司/部门），不建用户、不建岗位。
     *
     * <p>数据源：{@code GET /api/user/organization/tree}（用户 token，当前可用）。
     * 注意该接口只返回当前同步账号所在公司的组织链，不是全量组织——用户已知悉并接受先建可见部分。
     * 写入不自己实现：生成一份「只含公司/部门列」的 CSV，交给现成的
     * {@link OrgStructureImportService#doImport}，复用其多级层级解析、按名称幂等复用、
     * genericService.create 全部校验与审计，不重复造轮子、不覆盖手工数据。</p>
     */
    public Map<String, Object> applyOrganizationsOnly(String phone, String password) {
        List<ContactNode> tree = fetchOrganizationTree(phone, password);
        List<String[]> orgRows = new ArrayList<>();
        for (ContactNode root : tree) {
            walkOrg(root, null, null, orgRows);
        }
        if (orgRows.isEmpty()) {
            throw new IllegalStateException("柳讯组织树为空，未创建任何组织");
        }

        StringBuilder csv = new StringBuilder();
        csv.append(String.join(",", OrgStructureImportService.COLUMNS)).append('\n');
        for (String[] r : orgRows) {
            for (int i = 0; i < r.length; i++) {
                if (i > 0) csv.append(',');
                csv.append(csvCell(r[i]));
            }
            csv.append('\n');
        }
        MultipartFile file = new CsvMultipartFile(
                ("\uFEFF" + csv.toString()).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        try {
            OrgStructureImportService.OrgImportResult result =
                    orgImportService.doImport(file, true); // 任一非法整批回滚，避免建一半
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", result.status);
            out.put("rows", result.total);
            out.put("createdCompanies", result.createdCompanies);
            out.put("reusedCompanies", result.reusedCompanies);
            out.put("createdDepartments", result.createdDepartments);
            out.put("reusedDepartments", result.reusedDepartments);
            out.put("createdUsers", result.createdUsers);
            out.put("createdPositions", result.createdPositions);
            List<String> failures = new ArrayList<>();
            for (OrgStructureImportService.OrgImportResult.Failure f : result.failures) {
                failures.add("第" + f.row + "行：" + f.message);
            }
            out.put("failures", failures);
            out.put("ok", failures.isEmpty()
                    && !"REJECTED_INVALID".equalsIgnoreCase(String.valueOf(result.status))
                    && !"FAILED".equalsIgnoreCase(String.valueOf(result.status)));
            out.put("note", "只建公司/部门，未建用户与岗位；已存在组织按名称复用，不覆盖本地数据。");
            return out;
        } catch (java.io.IOException e) {
            throw new IllegalStateException("组织 CSV 生成失败：" + e.getMessage(), e);
        }
    }

    /** 拉取组织树（用户级接口，当前 /api/contacts 500 时的可用数据源） */
    private List<ContactNode> fetchOrganizationTree(String phone, String password) {
        if (properties.isMock()) return mockTree();
        if (phone == null || phone.trim().isEmpty() || password == null || password.isEmpty()) {
            throw new IllegalStateException("请填写柳讯手机号和密码");
        }
        String token = oauth2Client.userToken(phone, password);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        try {
            ResponseEntity<String> response = template().exchange(
                    properties.getBaseUrl() + "/api/user/organization/tree", HttpMethod.GET,
                    new HttpEntity<>(headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode result = root.path("result");
            List<ContactNode> nodes = new ArrayList<>();
            if (result.isArray()) {
                for (JsonNode n : result) nodes.add(toNode(n));
            }
            if (nodes.isEmpty()) {
                throw new IllegalStateException("柳讯组织树为空；请检查同步账号是否配置了组织");
            }
            return nodes;
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯组织树接口不可用：" + e.getMessage(), e);
        } catch (Exception e) {
            if (e instanceof IllegalStateException) throw (IllegalStateException) e;
            throw new IllegalStateException("柳讯组织树解析失败：" + e.getMessage(), e);
        }
    }

    /** 把组织节点树展开为「只含公司/部门列」的导入行：公司/上级公司/部门/上级部门 */
    private void walkOrg(ContactNode node, String companyName, String parentDeptName, List<String[]> rows) {
        if (node.type == 1) {
            String[] row = new String[OrgStructureImportService.COLUMNS.size()];
            row[0] = node.name;                 // 公司名称
            row[1] = "";                        // 公司编码：留空由导入器生成 GS-xxxx
            row[2] = "";                        // 部门名称：空 = 本行只建公司
            row[3] = "";                        // 上级部门
            row[12] = companyName == null ? "" : companyName; // 上级公司
            rows.add(row);
            for (ContactNode child : node.children) walkOrg(child, node.name, null, rows);
        } else if (node.type == 2) {
            String[] row = new String[OrgStructureImportService.COLUMNS.size()];
            row[0] = companyName == null ? "" : companyName;
            row[2] = node.name;                 // 部门名称
            row[3] = parentDeptName == null ? "" : parentDeptName; // 上级部门
            row[12] = "";                       // 部门行的上级公司留空（公司由第 0 列指定）
            rows.add(row);
            for (ContactNode child : node.children) {
                walkOrg(child, companyName, child.type == 2 ? node.name : null, rows);
            }
        }
    }

    private static String csvCell(String s) {
        String v = s == null ? "" : s;
        return v.contains(",") || v.contains("\"") || v.contains("\n")
                ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
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

    /** roleIds 读回是 List、写入是 JSON 字符串，统一取文本判断 */
    private static String roleText(Map<String, Object> row) {
        Object v = row.get("roleIds");
        if (v == null) return "";
        if (v instanceof Collection) {
            StringBuilder sb = new StringBuilder("[");
            int i = 0;
            for (Object o : (Collection<?>) v) {
                if (i++ > 0) sb.append(',');
                sb.append('"').append(o).append('"');
            }
            return sb.append(']').toString();
        }
        return String.valueOf(v);
    }

    /** 是否系统管理员（roleIds 含 R1） */
    private static boolean isAdmin(Map<String, Object> row) {
        return roleText(row).contains("\"R1\"");
    }

    /** 是否已只含指定角色（用于幂等跳过） */
    private static boolean hasOnlyRole(Map<String, Object> row, String code) {
        return ("[\"" + code + "\"]").equals(roleText(row));
    }

    /** 按公司批量停用：ENABLED → DISABLED，跳过系统管理员(R1)和当前登录账号。 */
    public Map<String, Object> disableByCompany(String companyId) {
        if (isEmpty(companyId)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "请选择公司");
        }
        Map<String, String[]> query = new LinkedHashMap<>();
        query.put("companyId", new String[]{companyId});
        List<Map<String, Object>> users = genericService.listInternal(USERS, query);
        String currentUserId = AuthContext.currentUserId();
        int disabled = 0, skippedAdmin = 0, skippedSelf = 0, skippedAlready = 0;
        for (Map<String, Object> u : users) {
            String id = str(u.get("id"));
            if (isAdmin(u)) { skippedAdmin++; continue; }
            if (id.equals(currentUserId)) { skippedSelf++; continue; }
            if (!ENABLED.equalsIgnoreCase(str(u.get("status")))) { skippedAlready++; continue; }
            Map<String, Object> patch = new LinkedHashMap<>(u);
            patch.put("status", "DISABLED");
            Object version = u.get("version");
            if (version != null) patch.put("version", version);
            patch.remove("id");
            genericService.update(USERS, id, patch);
            disabled++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("companyId", companyId.trim());
        result.put("total", users.size());
        result.put("disabled", disabled);
        result.put("skippedAdmin", skippedAdmin);
        result.put("skippedSelf", skippedSelf);
        result.put("skippedAlready", skippedAlready);
        return result;
    }

    /**
     * 按公司批量预置角色：该公司全部岗位 roleIds=["R3"]（含空岗位），并同步用户主表 roleIds=["R3"]。
     * 跳过系统管理员(R1)，避免把管理员降级。已为 R3 的不重复写。
     */
    public Map<String, Object> assignRolesByCompany(String companyId) {
        if (isEmpty(companyId)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "请选择公司");
        }
        String roles = RowCodec.writeJson(Collections.singletonList("R3"));
        Map<String, String[]> query = new LinkedHashMap<>();
        query.put("companyId", new String[]{companyId});
        List<Map<String, Object>> users = genericService.listInternal(USERS, query);
        // 岗位可能挂在别的公司（跨公司兼职），管理员判断必须查用户主表，不能只看岗位自身 roleIds
        Map<String, Map<String, Object>> userById = new LinkedHashMap<>();
        for (Map<String, Object> u : genericService.listInternal(USERS, Collections.emptyMap())) {
            userById.put(str(u.get("id")), u);
        }
        int usersUpdated = 0, usersSkipped = 0, skippedAdmin = 0;
        for (Map<String, Object> u : users) {
            String id = str(u.get("id"));
            if (isAdmin(u)) { skippedAdmin++; continue; }
            if (hasOnlyRole(u, "R3")) { usersSkipped++; continue; }
            Map<String, Object> patch = new LinkedHashMap<>(u);
            patch.put("roleIds", roles);
            Object version = u.get("version");
            if (version != null) patch.put("version", version);
            patch.remove("id");
            genericService.update(USERS, id, patch);
            usersUpdated++;
        }
        List<Map<String, Object>> positions = genericService.listInternal(POSITIONS, query);
        int positionsUpdated = 0, positionsSkipped = 0, positionsSkippedAdmin = 0;
        for (Map<String, Object> p : positions) {
            Map<String, Object> owner = userById.get(str(p.get("userId")));
            if (owner == null) continue; // 用户不存在，跳过
            if (isAdmin(owner)) { positionsSkippedAdmin++; continue; } // 按用户主表判断 R1
            if (hasOnlyRole(p, "R3")) { positionsSkipped++; continue; }
            Map<String, Object> patch = new LinkedHashMap<>(p);
            patch.put("roleIds", roles);
            Object version = p.get("version");
            if (version != null) patch.put("version", version);
            patch.remove("id");
            genericService.update(POSITIONS, str(p.get("id")), patch);
            positionsUpdated++;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("companyId", companyId.trim());
        result.put("role", "R3");
        result.put("userTotal", users.size());
        result.put("usersUpdated", usersUpdated);
        result.put("usersSkipped", usersSkipped);
        result.put("positionTotal", positions.size());
        result.put("positionsUpdated", positionsUpdated);
        result.put("positionsSkipped", positionsSkipped);
        result.put("skippedAdmin", skippedAdmin + positionsSkippedAdmin);
        return result;
    }

    // ------------------------------------------------------------------ 通讯录获取

    /**
     * 拉取柳讯全量通讯录。2026-11-24 柳讯修复服务端后，该接口可用，但仅接受
     * <b>用户 token</b>（client token 即便含 contact scope 仍 403），因此需账号密码
     * 现场换 token；响应体是 {@code {code, result:{allOrgStructureVOs,...}}}，
     * 组织树在 result 下（旧实现误读顶层字段，导致空树）。
     */
    private List<ContactNode> fetchContacts(String phone, String password) {
        if (properties.isMock()) return mockTree();
        if (phone == null || phone.trim().isEmpty() || password == null || password.isEmpty()) {
            throw new IllegalStateException("请填写柳讯手机号和密码（通讯录接口需要用户登录态）");
        }
        String token = oauth2Client.userToken(phone, password);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        try {
            ResponseEntity<String> response = template().exchange(
                    properties.getBaseUrl() + "/api/contacts", HttpMethod.GET,
                    new HttpEntity<>(headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            int code = root.path("code").asInt(-1);
            if (code != 0) {
                throw new IllegalStateException("柳讯通讯录返回错误 code=" + code + "：" + response.getBody());
            }
            JsonNode all = root.path("result").path("allOrgStructureVOs");
            List<ContactNode> nodes = new ArrayList<>();
            if (all.isArray()) {
                for (JsonNode n : all) nodes.add(toNode(n));
            }
            if (nodes.isEmpty()) {
                throw new IllegalStateException("柳讯通讯录返回空组织树；请确认同步账号的通讯录权限");
            }
            return nodes;
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯通讯录接口不可用：" + e.getMessage(), e);
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
        // 柳讯数据里存在「综合管理部 （党群工作部）」这类括号内多空格的脏数据，
        // 不规范化会建成同名部门、产生重复岗位（2026-11-24 事故）
        node.name = normalizeName(n.path("name").asText(""));
        node.postName = normalizeName(n.path("postName").asText(""));
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
                        out.companyParent.put(c.name, n.name); // 子公司记住上级公司
                        walk(Collections.singletonList(c), c.name, null, phoneById, out);
                    } else {
                        walk(Collections.singletonList(c), n.name, null, phoneById, out);
                    }
                }
            } else if (n.type == 2) {
                String key = companyName + "||" + n.name;
                out.deptKeys.add(key);
                for (ContactNode c : n.children) {
                    if (c.type == 2) {
                        out.deptParent.put(companyName + "||" + c.name, key); // 子部门记住上级部门
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
        Map<String, String> companyNameById = new LinkedHashMap<>();
        for (Map<String, Object> c : genericService.listInternal(COMPANIES, Collections.emptyMap())) {
            companyNameById.put(str(c.get("id")), str(c.get("name")));
        }
        for (Map<String, Object> d : genericService.listInternal(DEPARTMENTS, Collections.emptyMap())) {
            index.deptIdByKey.put(str(d.get("companyId")) + "||" + str(d.get("name")), str(d.get("id")));
            // 通讯录树里的部门 key 用「公司名||部门名」，必须建同名索引做幂等判断，
            // 否则 containsKey 永远 false，每次 apply 都会重复创建全部部门（2026-11-24 事故根因）
            String companyName = companyNameById.get(str(d.get("companyId")));
            if (!isEmpty(companyName)) {
                index.deptIdByCompanyNameKey.put(companyName + "||" + str(d.get("name")), str(d.get("id")));
            }
            index.deptCodes.add(str(d.get("code")));
        }
        for (Map<String, Object> u : genericService.listInternal(USERS, Collections.emptyMap())) {
            String phone = normalizePhone(str(u.get("phone")));
            if (isEmpty(phone)) phone = normalizePhone(str(u.get("username")));
            if (!isEmpty(phone)) index.userByPhone.put(phone, str(u.get("id")));
        }
        for (Map<String, Object> pos : genericService.listInternal(POSITIONS, Collections.emptyMap())) {
            String u = str(pos.get("userId")), c = str(pos.get("companyId")),
                    d = str(pos.get("deptId")), p = str(pos.get("position"));
            index.positionKeys.add(positionKey(u, c, d, p));
            index.positionDeptKeys.add(positionKey(u, c, d, ""));
        }
        return index;
    }

    /** 岗位幂等 key（与 SQLite/MySQL GROUP BY 的 NULL 口径一致：空串等同空） */
    private static String positionKey(String userId, String companyId, String deptId, String position) {
        return str(userId) + "||" + str(companyId) + "||" + str(deptId) + "||" + str(position);
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

    /** 名称规范化：去除所有空白（含全角空格），避免「综合管理部 （党群工作部）」这类脏数据建成同名组织 */
    private static String normalizeName(String s) {
        return String.valueOf(s == null ? "" : s).replaceAll("\\s+", "");
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
        /** 公司名 → 上级公司名；根公司不在表里 */
        final Map<String, String> companyParent = new LinkedHashMap<>();
        /** 部门 key(公司||部门) → 上级部门 key(公司||上级部门) */
        final Map<String, String> deptParent = new LinkedHashMap<>();
        final Set<String> deptKeys = new LinkedHashSet<>();
        final List<ContactPerson> people = new ArrayList<>();
        final List<ContactPerson> uniquePeople = new ArrayList<>();
    }

    /** 仅内存使用的 CSV MultipartFile，专供复用组织导入服务 */
    private static class CsvMultipartFile implements MultipartFile {
        private final byte[] bytes;

        CsvMultipartFile(byte[] bytes) { this.bytes = bytes; }

        public String getName() { return "file"; }
        public String getOriginalFilename() { return "liuxun-org.csv"; }
        public String getContentType() { return "text/plain"; }
        public boolean isEmpty() { return bytes.length == 0; }
        public long getSize() { return bytes.length; }
        public byte[] getBytes() { return bytes; }
        public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(bytes); }
        public void transferTo(java.io.File dest) throws java.io.IOException {
            java.nio.file.Files.write(dest.toPath(), bytes);
        }
    }

    private static class LocalIndex {
        final Map<String, String> companyIdByName = new LinkedHashMap<>();
        final Map<String, String> deptIdByKey = new LinkedHashMap<>();
        /** 公司名||部门名 → 部门 id，与通讯录树 deptKey 同口径，用于幂等判断 */
        final Map<String, String> deptIdByCompanyNameKey = new LinkedHashMap<>();
        final Map<String, String> userByPhone = new LinkedHashMap<>();
        /** 岗位幂等 key：userId||companyId||deptId||position */
        final Set<String> positionKeys = new LinkedHashSet<>();
        /** 岗位所在部门 key：userId||companyId||deptId（用于跳过空岗位名的重复节点） */
        final Set<String> positionDeptKeys = new LinkedHashSet<>();
        final Set<String> companyCodes = new LinkedHashSet<>();
        final Set<String> deptCodes = new LinkedHashSet<>();
    }
}
