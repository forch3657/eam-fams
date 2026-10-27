package com.fams.imports;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.contract.EnumCatalog;
import com.fams.engine.GenericService;
import com.fams.engine.RowCodec;
import com.fams.security.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 组织架构单表导入：客户只维护一张「公司—部门—人」的扁平表，系统内部自动拆分为
 * {@code org-companies} / {@code org-departments} / {@code org-users} 三张资源表落库。
 *
 * <p>设计要点：
 * <ul>
 *   <li><b>一行的粒度决定建什么</b>：只填公司→建公司；公司+部门→建部门；再加姓名→建用户。</li>
 *   <li><b>幂等复用</b>：以「公司名称 / 公司+部门名称」为业务键在内存索引里匹配，客户无需填写任何主键。</li>
 *   <li><b>不绕过既有校验</b>：落库统一走 {@link GenericService#create}，口令 BCrypt、唯一性、引用校验、
 *       审计戳、钩子全部生效。</li>
 *   <li><b>不覆盖既有账号</b>：登录账号重复直接判为该行失败，绝不改写他人口令。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrgStructureImportService {

    public static final String COMPANIES = "org-companies";
    public static final String DEPARTMENTS = "org-departments";
    public static final String USERS = "org-users";
    public static final String ROLES = "org-roles";

    private static final String STATUS_ENUM = "ENABLE_STATUS";
    private static final String ENABLED = "ENABLED";

    private static final String COMPANY_CODE_PREFIX = "GS-";
    private static final String DEPT_CODE_PREFIX = "BM-";

    private static final String DEPT_KEY_SEP = "\u0000";

    // ---------------------------------------------------------------- 单表列定义

    public static final String COL_COMPANY_NAME = "公司名称";
    public static final String COL_COMPANY_CODE = "公司编码";
    public static final String COL_DEPT_NAME = "部门名称";
    public static final String COL_DEPT_PARENT = "上级部门";
    public static final String COL_USER_NAME = "姓名";
    public static final String COL_USERNAME = "登录账号";
    public static final String COL_PASSWORD = "初始口令";
    public static final String COL_POSITION = "岗位";
    public static final String COL_PHONE = "手机";
    public static final String COL_EMAIL = "邮箱";
    public static final String COL_ROLES = "角色";
    public static final String COL_STATUS = "状态";

    /** 模板列顺序（也是校验时的必备列清单） */
    public static final List<String> COLUMNS = Collections.unmodifiableList(Arrays.asList(
            COL_COMPANY_NAME, COL_COMPANY_CODE, COL_DEPT_NAME, COL_DEPT_PARENT,
            COL_USER_NAME, COL_USERNAME, COL_PASSWORD, COL_POSITION,
            COL_PHONE, COL_EMAIL, COL_ROLES, COL_STATUS));

    private static final String[] COLUMN_NOTES = {
            "公司名称，必填；已存在则自动复用",
            "公司编码，选填；留空自动生成 GS-0001 形式",
            "部门名称，选填；留空表示该行只建公司",
            "上级部门，选填；留空为一级部门；须在本文件或系统中已存在于同一公司",
            "姓名，选填；留空表示该行只建部门",
            "登录账号，填写姓名时必填；全局唯一，重复不会覆盖已有账号",
            "初始口令，填写姓名时必填；至少 8 位且含字母/数字/符号中两类，导入后自动加密",
            "岗位，选填",
            "手机，选填",
            "邮箱，选填",
            "角色，选填；可填角色编码或名称，多个用 | 分隔",
            "状态，选填；默认 ENABLED，可选 ENABLED/DISABLED 或 启用/停用"
    };

    private static final String[] COLUMN_SAMPLES = {
            "示例科技有限公司", "GS-0001", "研发部", "", "张三", "zhangsan", "Zhang@2026!",
            "工程师", "13800138000", "zhangsan@example.com", "ROLE_ADMIN", ENABLED
    };

    private final ImportFileParser fileParser;
    private final GenericService genericService;
    private final PasswordPolicy passwordPolicy;
    private final EnumCatalog enumCatalog;
    private final PlatformTransactionManager transactionManager;

    // ---------------------------------------------------------------- 模板

    /**
     * 生成单表导入模板（CSV），与按资源导入的模板风格一致：
     * 第 1 行中文表头、第 2 行 {@code #说明}、第 3 行 {@code #示例}（后两行导入时自动跳过）。
     */
    public String templateCsv() {
        StringBuilder header = new StringBuilder();
        StringBuilder note = new StringBuilder();
        StringBuilder sample = new StringBuilder();
        for (int i = 0; i < COLUMNS.size(); i++) {
            if (i > 0) {
                header.append(',');
                note.append(',');
                sample.append(',');
            }
            header.append(csvCell(COLUMNS.get(i)));
            note.append(i == 0 ? "#说明 " + csvCell(COLUMN_NOTES[i]) : csvCell(COLUMN_NOTES[i]));
            sample.append(i == 0 ? "#示例 " + csvCell(COLUMN_SAMPLES[i]) : csvCell(COLUMN_SAMPLES[i]));
        }
        return header + "\n" + note + "\n" + sample + "\n";
    }

    // ---------------------------------------------------------------- 导入

    /**
     * 单表导入。
     *
     * @param abortOnError true：先逐行校验，任一行不合法则整批拒绝、零写入；写入阶段出现异常则整体回滚
     * @param abortOnError false：逐行尝试，失败行记入报告，其余正常写入
     */
    public OrgImportResult doImport(MultipartFile file, boolean abortOnError) throws IOException {
        List<ImportFileParser.ParsedRow> rows = fileParser.parse(file);
        OrgImportResult result = new OrgImportResult();
        result.total = rows.size();

        if (rows.isEmpty()) {
            result.failures.add(new OrgImportResult.Failure(1,
                    "文件中没有可导入的数据行；表头需为：" + String.join("/", COLUMNS)));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        List<String> missing = missingColumns(rows.get(0));
        if (!missing.isEmpty()) {
            result.failures.add(new OrgImportResult.Failure(1,
                    "模板缺少列：「" + String.join("」「", missing) + "」，请下载最新模板后重试"));
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        Index index = loadIndex();
        List<OrgRow> parsed = new ArrayList<>(rows.size());
        Set<String> fileUsernames = new HashSet<>();
        for (ImportFileParser.ParsedRow raw : rows) {
            try {
                parsed.add(toOrgRow(raw, index, fileUsernames));
            } catch (ApiException e) {
                result.failures.add(new OrgImportResult.Failure(raw.line, e.getMessage()));
                log.warn("组织架构导入校验失败：第 {} 行 - {}", raw.line, e.getMessage());
            }
        }

        if (abortOnError && !result.failures.isEmpty()) {
            result.status = Status.REJECTED_INVALID;
            return result;
        }

        if (abortOnError) {
            try {
                new TransactionTemplate(transactionManager)
                        .executeWithoutResult(status -> writeAll(parsed, result, index, true));
            } catch (RowFailure e) {
                // 事务已回滚：计数器归零，只保留触发回滚的失败原因
                resetCounters(result);
                result.failures.add(new OrgImportResult.Failure(e.line, e.message));
                result.status = Status.REJECTED_INVALID;
                log.warn("组织架构导入整体回滚：第 {} 行 - {}", e.line, e.message);
                return result;
            }
        } else {
            writeAll(parsed, result, index, false);
        }

        // 复用也是成功处理（例如重复导入同一份组织架构），不能因此把结果判为「全部失败」
        boolean wroteSomething = result.createdCompanies + result.reusedCompanies
                + result.createdDepartments + result.reusedDepartments + result.createdUsers > 0;
        if (result.failures.isEmpty()) {
            result.status = Status.OK;
        } else {
            result.status = wroteSomething ? Status.PARTIAL : Status.FAILED;
        }
        return result;
    }

    /** 写入三张资源表：公司 → 部门（按层级多趟）→ 用户 */
    private void writeAll(List<OrgRow> rows, OrgImportResult result, Index index, boolean abort) {
        writeCompanies(rows, result, index, abort);
        writeDepartments(rows, result, index, abort);
        writeUsers(rows, result, index, abort);
    }

    // ---------------------------------------------------------------- 第 1 趟：公司

    private void writeCompanies(List<OrgRow> rows, OrgImportResult result, Index index, boolean abort) {
        Set<String> created = new LinkedHashSet<>();
        Set<String> reused = new LinkedHashSet<>();

        for (OrgRow row : rows) {
            if (row.invalid) {
                continue;
            }
            CompanyRef ref = index.companiesByName.get(row.companyName);
            if (ref == null && !row.companyCode.isEmpty()) {
                CompanyRef byCode = index.companiesByCode.get(row.companyCode);
                if (byCode != null && !byCode.name.equals(row.companyName)) {
                    fail(row, "公司编码「" + row.companyCode + "」已被公司「" + byCode.name + "」占用，请调整编码或名称",
                            result, abort);
                    continue;
                }
                ref = byCode;
            }
            if (ref != null) {
                if (!row.companyCode.isEmpty() && !row.companyCode.equals(ref.code)) {
                    fail(row, "公司「" + ref.name + "」已存在，其编码为「" + ref.code
                            + "」，与填写的「" + row.companyCode + "」不一致", result, abort);
                    continue;
                }
                row.companyId = ref.id;
                if (!created.contains(ref.name)) {
                    reused.add(ref.name);
                }
                continue;
            }

            String code = row.companyCode.isEmpty()
                    ? autoCode(COMPANY_CODE_PREFIX, index.companiesByCode)
                    : row.companyCode;
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", code);
            body.put("name", row.companyName);
            body.put("status", row.status);
            try {
                Map<String, Object> saved = genericService.create(COMPANIES, body);
                CompanyRef createdRef = new CompanyRef(str(saved.get("id")), row.companyName, code);
                index.companiesByName.put(row.companyName, createdRef);
                index.companiesByCode.put(code, createdRef);
                created.add(row.companyName);
                row.companyId = createdRef.id;
            } catch (ApiException e) {
                fail(row, "新建公司失败：" + e.getMessage(), result, abort);
            }
        }

        result.createdCompanies = created.size();
        result.reusedCompanies = reused.size();
    }

    // ---------------------------------------------------------------- 第 2 趟：部门

    /**
     * 部门按层级多趟创建：每趟只创建「上级部门已就绪」的行，直到没有进展为止。
     * 这样文件里父部门写在子部门之后也能正确处理，且支持任意层级。
     */
    private void writeDepartments(List<OrgRow> rows, OrgImportResult result, Index index, boolean abort) {
        // 同一「公司 + 部门名」只建一次，其余行复用同一个部门
        LinkedHashMap<String, OrgRow> distinct = new LinkedHashMap<>();
        for (OrgRow row : rows) {
            if (row.invalid || row.deptName.isEmpty() || row.companyId == null) {
                continue;
            }
            String key = deptKey(row.companyId, row.deptName);
            if (!distinct.containsKey(key)) {
                distinct.put(key, row);
            }
        }

        Set<String> created = new LinkedHashSet<>();
        Set<String> reused = new LinkedHashSet<>();
        List<OrgRow> queue = new ArrayList<>(distinct.values());

        boolean progress = true;
        while (!queue.isEmpty() && progress) {
            progress = false;
            Iterator<OrgRow> it = queue.iterator();
            while (it.hasNext()) {
                OrgRow row = it.next();
                String key = deptKey(row.companyId, row.deptName);

                if (index.deptIdByKey.containsKey(key)) {
                    row.deptId = index.deptIdByKey.get(key);
                    if (!created.contains(key)) {
                        reused.add(key);
                    }
                    it.remove();
                    progress = true;
                    continue;
                }

                String parentId = null;
                if (!row.parentDeptName.isEmpty()) {
                    parentId = index.deptIdByKey.get(deptKey(row.companyId, row.parentDeptName));
                    if (parentId == null) {
                        continue; // 上级部门尚未就绪，留到下一趟
                    }
                }

                Map<String, Object> body = new LinkedHashMap<>();
                body.put("code", autoCode(DEPT_CODE_PREFIX, index.deptCodes));
                body.put("name", row.deptName);
                body.put("companyId", row.companyId);
                body.put("status", row.status);
                if (parentId != null) {
                    body.put("parentId", parentId);
                }
                try {
                    Map<String, Object> saved = genericService.create(DEPARTMENTS, body);
                    String id = str(saved.get("id"));
                    index.deptIdByKey.put(key, id);
                    index.deptCodes.put(str(saved.get("code")), id);
                    row.deptId = id;
                    created.add(key);
                } catch (ApiException e) {
                    fail(row, "新建部门失败：" + e.getMessage(), result, abort);
                }
                it.remove();
                progress = true;
            }
        }

        for (OrgRow row : queue) {
            String parentKey = deptKey(row.companyId, row.parentDeptName);
            String message = distinct.containsKey(parentKey)
                    ? "部门「" + row.deptName + "」与上级部门「" + row.parentDeptName + "」存在循环依赖，无法确定层级"
                    : "上级部门「" + row.parentDeptName + "」在同一公司下不存在，请先在本文件中补充该部门或先在系统中创建";
            fail(row, message, result, abort);
        }

        result.createdDepartments = created.size();
        result.reusedDepartments = reused.size();
    }

    // ---------------------------------------------------------------- 第 3 趟：用户

    private void writeUsers(List<OrgRow> rows, OrgImportResult result, Index index, boolean abort) {
        int created = 0;
        for (OrgRow row : rows) {
            if (row.invalid || row.userName.isEmpty() || row.companyId == null) {
                continue;
            }
            // 同一部门可能由文件中的另一行（部门行）创建，这里按业务键回查，保证人员归属正确
            String deptId = row.deptId != null
                    ? row.deptId
                    : index.deptIdByKey.get(deptKey(row.companyId, row.deptName));
            if (!row.deptName.isEmpty() && deptId == null) {
                fail(row, "所属部门「" + row.deptName + "」未能创建，该用户未导入", result, abort);
                continue;
            }
            row.deptId = deptId;

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("username", row.username);
            body.put("password", row.password);   // 明文入参，GenericService 内部按口令策略校验并 BCrypt
            body.put("name", row.userName);
            body.put("companyId", row.companyId);
            body.put("status", row.status);
            body.put("createdAt", LocalDateTime.now());
            if (row.deptId != null) {
                body.put("deptId", row.deptId);
            }
            if (!row.position.isEmpty()) {
                body.put("position", row.position);
            }
            if (!row.phone.isEmpty()) {
                body.put("phone", row.phone);
            }
            if (!row.email.isEmpty()) {
                body.put("email", row.email);
            }
            if (!row.roleIds.isEmpty()) {
                body.put("roleIds", RowCodec.writeJson(row.roleIds));
            }
            try {
                genericService.create(USERS, body);
                created++;
            } catch (ApiException e) {
                fail(row, "新建用户失败：" + e.getMessage(), result, abort);
            }
        }
        result.createdUsers = created;
    }

    // ---------------------------------------------------------------- 行解析与校验

    private OrgRow toOrgRow(ImportFileParser.ParsedRow raw, Index index, Set<String> fileUsernames) {
        OrgRow row = new OrgRow();
        row.line = raw.line;
        row.companyName = value(raw, COL_COMPANY_NAME);
        if (row.companyName.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "公司名称不能为空");
        }
        row.companyCode = value(raw, COL_COMPANY_CODE);
        row.deptName = value(raw, COL_DEPT_NAME);
        row.parentDeptName = value(raw, COL_DEPT_PARENT);
        row.userName = value(raw, COL_USER_NAME);
        row.username = value(raw, COL_USERNAME);
        row.password = value(raw, COL_PASSWORD);
        row.position = value(raw, COL_POSITION);
        row.phone = value(raw, COL_PHONE);
        row.email = value(raw, COL_EMAIL);

        String status = value(raw, COL_STATUS);
        if (status.isEmpty() || "启用".equals(status)) {
            row.status = ENABLED;
        } else if ("停用".equals(status)) {
            row.status = "DISABLED";
        } else {
            row.status = status.toUpperCase(Locale.ROOT);
        }
        Set<String> allowed = enumCatalog.allowed(STATUS_ENUM);
        if (!enumCatalog.isValid(STATUS_ENUM, row.status)) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "状态「" + status + "」不合法，可选值：" + String.join("/", allowed));
        }

        if (row.deptName.isEmpty() && !row.parentDeptName.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "填写「上级部门」时必须同时填写「部门名称」");
        }
        if (!row.deptName.isEmpty() && row.parentDeptName.equals(row.deptName)) {
            throw new ApiException(ErrorCode.VALIDATION, "「上级部门」不能与「部门名称」相同");
        }

        if (row.userName.isEmpty()) {
            if (!row.username.isEmpty() || !row.password.isEmpty()) {
                throw new ApiException(ErrorCode.VALIDATION,
                        "填写「登录账号」或「初始口令」时必须同时填写「姓名」，否则该行不会创建用户");
            }
            return row;
        }

        if (row.username.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "填写「姓名」时必须填写「登录账号」");
        }
        if (index.usernames.contains(row.username)) {
            throw new ApiException(ErrorCode.VALIDATION,
                    "登录账号「" + row.username + "」已存在，导入不会覆盖已有账号（如需调整请先在用户管理中处理）");
        }
        if (!fileUsernames.add(row.username)) {
            throw new ApiException(ErrorCode.VALIDATION, "登录账号「" + row.username + "」在文件中重复出现，请只保留一行");
        }
        if (row.password.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "填写「姓名」时必须填写「初始口令」");
        }
        passwordPolicy.validate(row.password, row.username);   // 不合规时抛 ApiException（消息可直接展示）

        row.roleIds = resolveRoles(value(raw, COL_ROLES), index);
        return row;
    }

    /** 角色列支持编码或名称，多个用 | 、 ; ， 分隔 */
    private List<String> resolveRoles(String text, Index index) {
        List<String> ids = new ArrayList<>();
        if (text.isEmpty()) {
            return ids;
        }
        for (String token : text.split("[,，;；|、]")) {
            String name = token.trim();
            if (name.isEmpty()) {
                continue;
            }
            String id = index.roleIdByCode.get(name);
            if (id == null) {
                id = index.roleIdByName.get(name);
            }
            if (id == null) {
                throw new ApiException(ErrorCode.VALIDATION, "角色「" + name + "」不存在，请填写角色编码或名称");
            }
            if (!ids.contains(id)) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static List<String> missingColumns(ImportFileParser.ParsedRow first) {
        List<String> missing = new ArrayList<>();
        for (String column : COLUMNS) {
            if (!first.values.containsKey(column)) {
                missing.add(column);
            }
        }
        return missing;
    }

    private static String value(ImportFileParser.ParsedRow row, String column) {
        String v = row.values.get(column);
        return v == null ? "" : v.trim();
    }

    // ---------------------------------------------------------------- 索引

    /**
     * 一次性预加载索引，避免逐行查库（N+1）。
     * 索引里的键都是客户视角的业务键，不含任何需要客户填写的主键。
     */
    private Index loadIndex() {
        Index index = new Index();
        for (Map<String, Object> row : genericService.list(COMPANIES, new HashMap<String, String[]>())) {
            String id = str(row.get("id"));
            String name = str(row.get("name"));
            String code = str(row.get("code"));
            if (id.isEmpty() || name.isEmpty()) {
                continue;
            }
            CompanyRef ref = new CompanyRef(id, name, code);
            index.companiesByName.put(name, ref);
            if (!code.isEmpty()) {
                index.companiesByCode.put(code, ref);
            }
        }
        for (Map<String, Object> row : genericService.list(DEPARTMENTS, new HashMap<String, String[]>())) {
            String id = str(row.get("id"));
            String name = str(row.get("name"));
            String companyId = str(row.get("companyId"));
            if (id.isEmpty() || name.isEmpty() || companyId.isEmpty()) {
                continue;
            }
            index.deptIdByKey.put(deptKey(companyId, name), id);
            String code = str(row.get("code"));
            if (!code.isEmpty()) {
                index.deptCodes.put(code, id);
            }
        }
        for (Map<String, Object> row : genericService.list(USERS, new HashMap<String, String[]>())) {
            String username = str(row.get("username"));
            if (!username.isEmpty()) {
                index.usernames.add(username);
            }
        }
        for (Map<String, Object> row : genericService.list(ROLES, new HashMap<String, String[]>())) {
            String id = str(row.get("id"));
            if (id.isEmpty()) {
                continue;
            }
            String code = str(row.get("code"));
            String name = str(row.get("name"));
            if (!code.isEmpty()) {
                index.roleIdByCode.put(code, id);
            }
            if (!name.isEmpty()) {
                index.roleIdByName.put(name, id);
            }
        }
        return index;
    }

    // ---------------------------------------------------------------- 工具

    /** 失败处理：整批模式立即抛出让事务回滚；逐行模式记录并标记该行，后续趟次跳过 */
    private void fail(OrgRow row, String message, OrgImportResult result, boolean abort) {
        row.invalid = true;
        log.warn("组织架构导入失败：第 {} 行 - {}", row.line, message);
        if (abort) {
            throw new RowFailure(row.line, message);
        }
        result.failures.add(new OrgImportResult.Failure(row.line, message));
    }

    /** 自动编码：前缀 + 4 位序号，跳过已被占用的编码 */
    private static String autoCode(String prefix, Map<String, ?> used) {
        int n = used.size() + 1;
        String code;
        do {
            code = prefix + String.format("%04d", n++);
        } while (used.containsKey(code));
        return code;
    }

    private static void resetCounters(OrgImportResult result) {
        result.createdCompanies = 0;
        result.reusedCompanies = 0;
        result.createdDepartments = 0;
        result.reusedDepartments = 0;
        result.createdUsers = 0;
    }

    private static String deptKey(String companyId, String deptName) {
        return companyId + DEPT_KEY_SEP + deptName;
    }

    private static String str(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String csvCell(String v) {
        if (v == null || v.isEmpty()) {
            return "";
        }
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
            return "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }

    // ---------------------------------------------------------------- 内部类型

    /** 导入结果状态 */
    public static final class Status {
        public static final String OK = "OK";
        public static final String PARTIAL = "PARTIAL";
        public static final String FAILED = "FAILED";
        public static final String REJECTED_INVALID = "REJECTED_INVALID";

        private Status() {
        }
    }

    /** 一行解析后的结构化数据 */
    private static final class OrgRow {
        int line;
        String companyName = "";
        String companyCode = "";
        String deptName = "";
        String parentDeptName = "";
        String userName = "";
        String username = "";
        String password = "";
        String position = "";
        String phone = "";
        String email = "";
        String status = ENABLED;
        List<String> roleIds = Collections.emptyList();
        String companyId;
        String deptId;
        boolean invalid;
    }

    private static final class CompanyRef {
        final String id;
        final String name;
        final String code;

        CompanyRef(String id, String name, String code) {
            this.id = id;
            this.name = name;
            this.code = code;
        }
    }

    /** 预加载索引（一次查库，全量内存匹配） */
    private static final class Index {
        final Map<String, CompanyRef> companiesByName = new LinkedHashMap<>();
        final Map<String, CompanyRef> companiesByCode = new LinkedHashMap<>();
        final Map<String, String> deptIdByKey = new LinkedHashMap<>();
        final Map<String, String> deptCodes = new LinkedHashMap<>();
        final Set<String> usernames = new HashSet<>();
        final Map<String, String> roleIdByCode = new HashMap<>();
        final Map<String, String> roleIdByName = new HashMap<>();
    }

    /** 整批模式的内部回滚信号 */
    private static final class RowFailure extends RuntimeException {
        final int line;
        final String message;

        RowFailure(int line, String message) {
            super(message, null, false, false);
            this.line = line;
            this.message = message;
        }
    }

    // ---------------------------------------------------------------- DTO

    /** 分级结果报告：逐层统计新建/复用数量 + 失败明细（带行号） */
    public static class OrgImportResult {
        public int total;
        public int createdCompanies;
        public int reusedCompanies;
        public int createdDepartments;
        public int reusedDepartments;
        public int createdUsers;
        public String status;
        public List<Failure> failures = new ArrayList<>();

        public static class Failure {
            public int row;
            public String message;

            public Failure(int row, String message) {
                this.row = row;
                this.message = message;
            }
        }
    }
}
