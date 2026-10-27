package com.fams.p9;

import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.imports.OrgStructureImportService;
import com.fams.security.LoginAttemptService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P9 组织架构单表导入：客户只维护一张「公司—部门—人」的扁平表，
 * 后端按行的粒度自动拆分并复用，落库仍走 {@link GenericService#create}（口令 BCrypt、唯一性、引用校验全部生效）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class P9OrgStructureImportTest {

    private static final String HEADER = String.join(",", OrgStructureImportService.COLUMNS);

    private static final String COMPANIES = OrgStructureImportService.COMPANIES;
    private static final String DEPARTMENTS = OrgStructureImportService.DEPARTMENTS;
    private static final String USERS = OrgStructureImportService.USERS;

    @Autowired
    private OrgStructureImportService orgService;

    @Autowired
    private GenericService genericService;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
        loginAttemptService.loginSucceeded(TestAccounts.ADMIN);
        if (token != null) {
            return;
        }
        Map<String, String> body = new HashMap<>();
        body.put("username", TestAccounts.ADMIN);
        body.put("password", TestAccounts.PASSWORD);
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response)
                .path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    // -------------------------------------------------------------- 粒度与复用

    @Test
    @DisplayName("一行写到哪一层就建到哪一层，同一公司/部门只创建一次")
    void granularityAndReuse() throws Exception {
        String csv = String.join("\n",
                row("甲测试科技有限公司", "GS-T1", "", "", "", "", "", "", "", "", "", ""),
                row("甲测试科技有限公司", "GS-T1", "研发部", "", "", "", "", "", "", "", "", ""),
                row("甲测试科技有限公司", "GS-T1", "研发部", "", "张三", "p9_zhangsan", "Zhang@2026!",
                        "工程师", "13800138001", "zhangsan@example.com", "ROLE_ADMIN", "启用"),
                row("甲测试科技有限公司", "GS-T1", "", "", "李四", "p9_lisi", "Zhang@2026!", "", "", "", "", ""));

        OrgStructureImportService.OrgImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.OK);
        assertThat(res.total).isEqualTo(4);
        assertThat(res.createdCompanies).isEqualTo(1);
        assertThat(res.reusedCompanies).isZero();
        assertThat(res.createdDepartments).isEqualTo(1);
        // 「复用」只统计命中库中已有记录；同一文件内多行共享的部门只建一次，不计入复用
        assertThat(res.reusedDepartments).isZero();
        assertThat(res.createdUsers).isEqualTo(2);
        assertThat(res.failures).isEmpty();

        Map<String, Object> company = findOne(COMPANIES, "name", "甲测试科技有限公司");
        assertThat(company).isNotNull();
        assertThat(company.get("code")).isEqualTo("GS-T1");

        Map<String, Object> dept = findOne(DEPARTMENTS,
                "name", "研发部", "companyId", String.valueOf(company.get("id")));
        assertThat(dept).isNotNull();
        assertThat(dept.get("parentId")).isNull();

        Map<String, Object> user = findOne(USERS, "username", "p9_zhangsan");
        assertThat(user).isNotNull();
        assertThat(user.get("companyId")).isEqualTo(company.get("id"));
        assertThat(user.get("deptId")).isEqualTo(dept.get("id"));
        assertThat(String.valueOf(user.get("roleIds"))).contains("R1");
        assertThat(user.get("status")).isEqualTo("ENABLED");

        // 未填部门的人员也能导入（部门为可选）
        Map<String, Object> noDeptUser = findOne(USERS, "username", "p9_lisi");
        assertThat(noDeptUser).isNotNull();
        assertThat(noDeptUser.get("deptId")).isNull();

        // 口令必须 BCrypt 落库，绝不存明文
        Map<String, Object> raw = findInternal(USERS, "username", "p9_zhangsan");
        String password = String.valueOf(raw.get("password"));
        assertThat(password).startsWith("$2").isNotEqualTo("Zhang@2026!");
    }

    @Test
    @DisplayName("重复导入同一文件：公司/部门复用，账号重复判为该行失败且不改动已有口令")
    void reimportReusesAndNeverOverwritesPassword() throws Exception {
        String csv = String.join("\n",
                row("乙测试科技有限公司", "GS-T2", "财务部", "", "王五", "p9_wangwu", "Wang@2026!", "", "", "", "", ""),
                row("乙测试科技有限公司", "GS-T2", "财务部", "", "", "", "", "", "", "", "", ""));

        assertThat(importCsv(csv, true).status).isEqualTo(OrgStructureImportService.Status.OK);
        String before = String.valueOf(findInternal(USERS, "username", "p9_wangwu").get("password"));

        OrgStructureImportService.OrgImportResult again = importCsv(csv, false);
        assertThat(again.status).isEqualTo(OrgStructureImportService.Status.PARTIAL);
        assertThat(again.createdCompanies).isZero();
        assertThat(again.reusedCompanies).isEqualTo(1);
        assertThat(again.createdDepartments).isZero();
        assertThat(again.reusedDepartments).isEqualTo(1);
        assertThat(again.createdUsers).isZero();
        assertThat(again.failures).hasSize(1);
        assertThat(again.failures.get(0).message).contains("已存在");

        String after = String.valueOf(findInternal(USERS, "username", "p9_wangwu").get("password"));
        assertThat(after).isEqualTo(before);
    }

    // -------------------------------------------------------------- 层级

    @Test
    @DisplayName("子部门写在父部门之前也能正确建立层级（多趟处理）")
    void parentDepartmentResolvedRegardlessOfOrder() throws Exception {
        String csv = String.join("\n",
                row("丙测试科技有限公司", "GS-T3", "研发二部", "研发一部", "", "", "", "", "", "", "", ""),
                row("丙测试科技有限公司", "GS-T3", "研发一部", "", "", "", "", "", "", "", "", ""));

        OrgStructureImportService.OrgImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.OK);
        assertThat(res.createdCompanies).isEqualTo(1);
        assertThat(res.createdDepartments).isEqualTo(2);
        assertThat(res.failures).isEmpty();

        Map<String, Object> company = findOne(COMPANIES, "name", "丙测试科技有限公司");
        String companyId = String.valueOf(company.get("id"));
        Map<String, Object> parent = findOne(DEPARTMENTS, "name", "研发一部", "companyId", companyId);
        Map<String, Object> child = findOne(DEPARTMENTS, "name", "研发二部", "companyId", companyId);
        assertThat(parent).isNotNull();
        assertThat(child).isNotNull();
        assertThat(child.get("parentId")).isEqualTo(parent.get("id"));
        assertThat(String.valueOf(child.get("code"))).startsWith("BM-");
    }

    @Test
    @DisplayName("部门层级循环依赖会被识别并报错")
    void departmentCycleDetected() throws Exception {
        String csv = String.join("\n",
                row("丁测试科技有限公司", "GS-T4", "A部", "B部", "", "", "", "", "", "", "", ""),
                row("丁测试科技有限公司", "GS-T4", "B部", "A部", "", "", "", "", "", "", "", ""));

        OrgStructureImportService.OrgImportResult res = importCsv(csv, false);

        // 公司本身可以创建，因此整批是「部分成功」
        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.PARTIAL);
        assertThat(res.createdCompanies).isEqualTo(1);
        assertThat(res.createdDepartments).isZero();
        assertThat(res.failures).hasSize(2);
        assertThat(res.failures.get(0).message).contains("循环依赖");
    }

    // -------------------------------------------------------------- 校验

    @Test
    @DisplayName("整批校验：口令不合规则整批拒绝、零写入")
    void abortOnInvalidPasswordRejectsWholeBatch() throws Exception {
        String csv = String.join("\n",
                row("戊测试科技有限公司", "GS-T5", "", "", "", "", "", "", "", "", "", ""),
                row("戊测试科技有限公司", "GS-T5", "", "", "赵六", "p9_zhaoliu", "weak", "", "", "", "", ""));

        OrgStructureImportService.OrgImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(res.createdCompanies).isZero();
        assertThat(res.createdUsers).isZero();
        assertThat(res.failures).hasSize(1);
        assertThat(res.failures.get(0).row).isEqualTo(3);
        assertThat(res.failures.get(0).message).contains("密码");
        assertThat(findOne(COMPANIES, "name", "戊测试科技有限公司")).isNull();
    }

    @Test
    @DisplayName("逐行模式：错误行跳过，其余正常写入")
    void partialModeKeepsValidRows() throws Exception {
        String csv = String.join("\n",
                row("己测试科技有限公司", "GS-T6", "", "", "", "", "", "", "", "", "", ""),
                row("己测试科技有限公司", "GS-T6", "", "", "周九", "p9_zhoujiu", "weak", "", "", "", "", ""));

        OrgStructureImportService.OrgImportResult res = importCsv(csv, false);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.PARTIAL);
        assertThat(res.createdCompanies).isEqualTo(1);
        assertThat(res.failures).hasSize(1);
        assertThat(findOne(COMPANIES, "name", "己测试科技有限公司")).isNotNull();
    }

    @Test
    @DisplayName("登录账号与库中已有账号重复时拒绝，不覆盖他人口令")
    void existingUsernameRejected() throws Exception {
        String csv = row("庚测试科技有限公司", "GS-T7", "", "", "管理员", TestAccounts.ADMIN,
                "Admin@2026!", "", "", "", "", "");

        OrgStructureImportService.OrgImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(res.failures).hasSize(1);
        assertThat(res.failures.get(0).message).contains("已存在");
        assertThat(findOne(COMPANIES, "name", "庚测试科技有限公司")).isNull();
    }

    @Test
    @DisplayName("角色按编码或名称均可匹配；未知角色报错")
    void roleResolvedByCodeOrName() throws Exception {
        OrgStructureImportService.OrgImportResult byName = importCsv(
                row("辛测试科技有限公司", "GS-T8", "", "", "钱七", "p9_qianqi", "Qian@2026!",
                        "", "", "", "系统管理员", ""), true);
        assertThat(byName.status).isEqualTo(OrgStructureImportService.Status.OK);
        assertThat(String.valueOf(findOne(USERS, "username", "p9_qianqi").get("roleIds"))).contains("R1");

        OrgStructureImportService.OrgImportResult unknown = importCsv(
                row("壬测试科技有限公司", "GS-T9", "", "", "孙八", "p9_sunba", "Sun@2026!",
                        "", "", "", "不存在的角色", ""), true);
        assertThat(unknown.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(unknown.failures.get(0).message).contains("不存在");
    }

    @Test
    @DisplayName("行级校验：公司名为空 / 只填上级部门 / 状态非法 都会被明确指出")
    void rowLevelValidationMessages() throws Exception {
        assertThat(importCsv(row("", "GS-X1", "", "", "", "", "", "", "", "", "", ""), true)
                .failures.get(0).message).contains("公司名称不能为空");

        assertThat(importCsv(row("癸测试科技有限公司", "GS-X2", "", "研发部", "", "", "", "", "", "", "", ""), true)
                .failures.get(0).message).contains("必须同时填写「部门名称」");

        assertThat(importCsv(row("癸测试科技有限公司", "GS-X3", "", "", "", "", "", "", "", "", "", "UNKNOWN"), true)
                .failures.get(0).message).contains("不合法");
    }

    @Test
    @DisplayName("公司编码冲突 / 与已有公司编码不一致时给出可读提示")
    void companyCodeConflictMessages() throws Exception {
        // GS-0001 已被种子公司「华信科技集团有限公司」占用
        OrgStructureImportService.OrgImportResult occupied = importCsv(
                row("编码冲突测试公司", "GS-0001", "", "", "", "", "", "", "", "", "", ""), true);
        assertThat(occupied.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(occupied.failures.get(0).message).contains("已被公司");

        OrgStructureImportService.OrgImportResult mismatch = importCsv(
                row("华信科技集团有限公司", "GS-9999", "", "", "", "", "", "", "", "", "", ""), true);
        assertThat(mismatch.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(mismatch.failures.get(0).message).contains("不一致");
    }

    @Test
    @DisplayName("公司编码留空时自动生成且不重复")
    void autoGeneratedCompanyCode() throws Exception {
        OrgStructureImportService.OrgImportResult res = importCsv(
                row("自动编码测试公司", "", "", "", "", "", "", "", "", "", "", ""), true);
        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.OK);
        Map<String, Object> company = findOne(COMPANIES, "name", "自动编码测试公司");
        assertThat(String.valueOf(company.get("code"))).startsWith("GS-");
    }

    // -------------------------------------------------------------- 模板与文件

    @Test
    @DisplayName("模板可原样使用：说明/示例行自动跳过，追加数据即可导入")
    void templateIsDirectlyUsable() throws Exception {
        String csv = orgService.templateCsv()
                + row("模板直用测试公司", "GS-TPL", "综合部", "", "王五", "p9_tpl_wangwu", "Wang@2026!",
                "", "13800138002", "", "", "ENABLED") + "\n";

        OrgStructureImportService.OrgImportResult res = importWholeFile(csv, true);

        assertThat(res.status).isEqualTo(OrgStructureImportService.Status.OK);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.createdCompanies).isEqualTo(1);
        assertThat(res.createdDepartments).isEqualTo(1);
        assertThat(res.createdUsers).isEqualTo(1);
        assertThat(res.failures).isEmpty();
    }

    @Test
    @DisplayName("模板缺列 / 无数据行时给出可读提示")
    void invalidTemplateRejected() throws Exception {
        OrgStructureImportService.OrgImportResult missing = importWholeFile("公司名称,部门名称\n测试公司,研发部\n", true);
        assertThat(missing.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(missing.failures.get(0).message).contains("模板缺少列");

        OrgStructureImportService.OrgImportResult empty = importWholeFile(HEADER + "\n", true);
        assertThat(empty.status).isEqualTo(OrgStructureImportService.Status.REJECTED_INVALID);
        assertThat(empty.failures.get(0).message).contains("没有可导入的数据行");
    }

    // -------------------------------------------------------------- 控制器

    @Test
    @DisplayName("控制器：模板下载 / 单表上传")
    void controllerFlow() throws Exception {
        String template = mockMvc.perform(get("/api/data-import/org-template")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(template).contains("公司名称").contains("部门名称").contains("登录账号");

        String csv = HEADER + "\n"
                + row("控制器导入测试公司", "GS-CTRL", "测试部", "", "测试员", "p9_ctrl_user", "Ctrl@2026!",
                "", "", "", "", "") + "\n";
        MockMultipartFile file = new MockMultipartFile("file", "org.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/data-import/org-upload?abortOnError=true")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(OrgStructureImportService.Status.OK))
                .andExpect(jsonPath("$.data.createdCompanies").value(1))
                .andExpect(jsonPath("$.data.createdDepartments").value(1))
                .andExpect(jsonPath("$.data.createdUsers").value(1));
    }

    // -------------------------------------------------------------- 工具

    private OrgStructureImportService.OrgImportResult importCsv(String data, boolean abortOnError) throws Exception {
        return importWholeFile(HEADER + "\n" + data + "\n", abortOnError);
    }

    private OrgStructureImportService.OrgImportResult importWholeFile(String content, boolean abortOnError)
            throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "org.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));
        return orgService.doImport(file, abortOnError);
    }

    /** 按模板列顺序拼一行：公司名称, 公司编码, 部门名称, 上级部门, 姓名, 登录账号, 初始口令, 岗位, 手机, 邮箱, 角色, 状态 */
    private static String row(String company, String code, String dept, String parent,
                              String name, String username, String password, String position,
                              String phone, String email, String roles, String status) {
        return String.join(",", company, code, dept, parent, name, username, password,
                position, phone, email, roles, status);
    }

    private Map<String, Object> findOne(String key, String... pairs) {
        return find(genericService.list(key, new HashMap<String, String[]>()), pairs);
    }

    /** 未经脱敏的原始行（用于校验 BCrypt 口令） */
    private Map<String, Object> findInternal(String key, String... pairs) {
        return find(genericService.listInternal(key, new HashMap<String, String[]>()), pairs);
    }

    private static Map<String, Object> find(List<Map<String, Object>> rows, String... pairs) {
        for (Map<String, Object> row : rows) {
            boolean match = true;
            for (int i = 0; i + 1 < pairs.length; i += 2) {
                if (!pairs[i + 1].equals(String.valueOf(row.get(pairs[i])))) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return row;
            }
        }
        return null;
    }
}
