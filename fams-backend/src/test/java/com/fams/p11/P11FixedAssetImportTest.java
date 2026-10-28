package com.fams.p11;

import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.imports.FixedAssetImportService;
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

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
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
 * P11 固定资产单表导入：一行 = 一张资产卡片（一物一码），公司/部门/使用人按名称匹配，
 * 存放地点不存在自动建档；已存在的资产编号只复用、不覆盖。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class P11FixedAssetImportTest {

    private static final String HEADER = String.join(",", FixedAssetImportService.COLUMNS);
    private static final String ASSETS = FixedAssetImportService.ASSETS;
    private static final String LOCATIONS = FixedAssetImportService.LOCATIONS;

    @Autowired
    private FixedAssetImportService fixedAssetService;

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

    // -------------------------------------------------------------- 基础落库

    @Test
    @DisplayName("一行建一张资产卡片：自动编号 + 公司/部门/使用人按名称解析")
    void createAssetWithResolvedOrg() throws Exception {
        String csv = row("P11测试笔记本", "电子设备", "", "联想", "ThinkPad T14",
                "华信科技集团有限公司", "技术部", "admin", "总部办公楼2层",
                "2026-03-12", "8500", "", "", "购买", "空闲", "是");

        FixedAssetImportService.FixedAssetImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.OK);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.createdAssets).isEqualTo(1);
        assertThat(res.reusedAssets).isZero();
        assertThat(res.createdLocations).isZero();
        assertThat(res.failures).isEmpty();

        Map<String, Object> asset = findOne(ASSETS, "name", "P11测试笔记本");
        assertThat(asset).isNotNull();
        assertThat(String.valueOf(asset.get("code"))).startsWith("GD" + LocalDate.now().getYear());
        assertThat(asset.get("category")).isEqualTo("ELECTRONIC");
        assertThat(asset.get("companyId")).isEqualTo("C1");
        assertThat(asset.get("deptId")).isEqualTo("D1");
        assertThat(asset.get("userId")).isEqualTo("U1");
        assertThat(asset.get("location")).isEqualTo("总部办公楼2层");
        assertThat(asset.get("status")).isEqualTo("IDLE");
        assertThat(asset.get("purchaseMode")).isEqualTo("PURCHASE");
        assertNumber(asset.get("amount"), "8500");
        assertNumber(asset.get("original"), "8500");
        assertNumber(asset.get("net"), "8500");
        assertNumber(asset.get("leaseMonths"), "36");
        assertThat(String.valueOf(asset.get("depreciate"))).isIn("true", "TRUE", "1");
    }

    @Test
    @DisplayName("中文枚举与折旧开关：使用中 / 租赁 / 否 正确落库")
    void chineseEnumsAndDepreciateFlag() throws Exception {
        String csv = row("P11测试租赁设备", "机械设备", "", "沈阳机床", "CK6140",
                "", "", "系统管理员", "", "2025-09-10", "268000", "250000", "200000",
                "租赁", "使用中", "否");

        FixedAssetImportService.FixedAssetImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.OK);
        Map<String, Object> asset = findOne(ASSETS, "name", "P11测试租赁设备");
        assertThat(asset.get("category")).isEqualTo("MACHINE");
        assertThat(asset.get("status")).isEqualTo("IN_USE");
        assertThat(asset.get("purchaseMode")).isEqualTo("LEASE");
        assertThat(String.valueOf(asset.get("depreciate"))).isIn("false", "FALSE", "0");
        assertNumber(asset.get("amount"), "268000");
        assertNumber(asset.get("original"), "250000");
        assertNumber(asset.get("net"), "200000");
        // 使用人按姓名解析
        assertThat(asset.get("userId")).isEqualTo("U1");
    }

    @Test
    @DisplayName("存放地点不存在时自动建档")
    void autoCreateLocation() throws Exception {
        String csv = row("P11测试地点设备", "电子设备", "", "", "", "", "", "", "P11临时机房",
                "", "1000", "", "", "", "", "");

        FixedAssetImportService.FixedAssetImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.OK);
        assertThat(res.createdLocations).isEqualTo(1);
        Map<String, Object> location = findOne(LOCATIONS, "name", "P11临时机房");
        assertThat(location).isNotNull();
        assertThat(String.valueOf(location.get("code"))).startsWith("LOC-");
        assertThat(findOne(ASSETS, "name", "P11测试地点设备").get("location")).isEqualTo("P11临时机房");
    }

    // -------------------------------------------------------------- 幂等

    @Test
    @DisplayName("资产编号已存在时只复用，不覆盖原有数据")
    void existingCodeReused() throws Exception {
        Map<String, Object> before = findOne(ASSETS, "code", "GD20260001");
        assertThat(before).isNotNull();

        String csv = row("联想ThinkPad笔记本电脑", "电子设备", "GD20260001", "联想", "ThinkPad T14",
                "", "", "", "", "", "99999", "", "", "", "", "");
        FixedAssetImportService.FixedAssetImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.OK);
        assertThat(res.createdAssets).isZero();
        assertThat(res.reusedAssets).isEqualTo(1);

        Map<String, Object> after = findOne(ASSETS, "code", "GD20260001");
        assertNumber(after.get("amount"), String.valueOf(before.get("amount")));
        assertNumber(after.get("net"), String.valueOf(before.get("net")));
    }

    // -------------------------------------------------------------- 组织匹配

    @Test
    @DisplayName("同名部门：不填公司会提示歧义，填了公司则正确归属")
    void duplicateDeptNameNeedsCompany() throws Exception {
        FixedAssetImportService.FixedAssetImportResult ambiguous = importCsv(
                row("P11测试歧义部门", "电子设备", "", "", "", "", "财务部", "", "",
                        "", "1", "", "", "", "", ""), true);
        assertThat(ambiguous.status).isEqualTo(FixedAssetImportService.Status.REJECTED_INVALID);
        assertThat(ambiguous.failures.get(0).message).contains("多个同名部门");

        FixedAssetImportService.FixedAssetImportResult resolved = importCsv(
                row("P11测试歧义部门2", "电子设备", "", "", "", "云鼎资产管理有限公司", "财务部", "", "",
                        "", "1", "", "", "", "", ""), true);
        assertThat(resolved.status).isEqualTo(FixedAssetImportService.Status.OK);
        assertThat(findOne(ASSETS, "name", "P11测试歧义部门2").get("deptId")).isEqualTo("D9");
    }

    @Test
    @DisplayName("公司不存在 / 部门不属于该公司 / 使用人不存在 都会给出可读提示")
    void orgReferenceMessages() throws Exception {
        assertThat(importCsv(row("P11测试公司不存在", "电子设备", "", "", "", "不存在的公司", "", "", "",
                "", "1", "", "", "", "", ""), true)
                .failures.get(0).message).contains("不存在");

        FixedAssetImportService.FixedAssetImportResult wrongDept = importCsv(
                row("P11测试部门越界", "电子设备", "", "", "", "云鼎资产管理有限公司", "技术部", "", "",
                        "", "1", "", "", "", "", ""), true);
        assertThat(wrongDept.status).isEqualTo(FixedAssetImportService.Status.REJECTED_INVALID);
        assertThat(wrongDept.failures.get(0).message).contains("下不存在部门");

        assertThat(importCsv(row("P11测试人员不存在", "电子设备", "", "", "", "", "", "查无此人", "",
                "", "1", "", "", "", "", ""), true)
                .failures.get(0).message).contains("不存在");
    }

    // -------------------------------------------------------------- 校验

    @Test
    @DisplayName("整批校验：缺名称 / 非法分类 / 非法日期 / 非法金额 都会整批拒绝且零写入")
    void invalidRowsRejectWholeBatch() throws Exception {
        assertThat(importCsv(row("", "电子设备", "", "", "", "", "", "", "", "", "1", "", "", "", "", ""), true)
                .failures.get(0).message).contains("资产名称不能为空");

        assertThat(importCsv(row("P11测试非法分类", "不存在的分类", "", "", "", "", "", "", "",
                "", "1", "", "", "", "", ""), true)
                .failures.get(0).message).contains("不合法");

        assertThat(importCsv(row("P11测试非法日期", "电子设备", "", "", "", "", "", "", "",
                "2026-13-40", "1", "", "", "", "", ""), true)
                .failures.get(0).message).contains("yyyy-MM-dd");

        assertThat(importCsv(row("P11测试非法金额", "电子设备", "", "", "", "", "", "", "",
                "", "abc", "", "", "", "", ""), true)
                .failures.get(0).message).contains("应为数字");

        assertThat(importCsv(row("P11测试负金额", "电子设备", "", "", "", "", "", "", "",
                "", "-5", "", "", "", "", ""), true)
                .failures.get(0).message).contains("不能为负数");

        assertThat(findOne(ASSETS, "name", "P11测试非法分类")).isNull();
        assertThat(findOne(ASSETS, "name", "P11测试非法金额")).isNull();
    }

    @Test
    @DisplayName("同一文件里资产编号重复会报错")
    void duplicateCodeInFileRejected() throws Exception {
        String line = row("P11测试重复编号", "电子设备", "GD2026-DUP", "", "", "", "", "", "",
                "", "1", "", "", "", "", "");
        FixedAssetImportService.FixedAssetImportResult res = importCsv(line + "\n" + line, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.REJECTED_INVALID);
        assertThat(res.failures.get(0).row).isEqualTo(3);
        assertThat(res.failures.get(0).message).contains("重复出现");
    }

    @Test
    @DisplayName("逐行模式：错误行跳过，其余正常写入")
    void partialModeKeepsValidRows() throws Exception {
        String csv = String.join("\n",
                row("P11测试部分成功", "电子设备", "", "", "", "", "", "", "", "", "100", "", "", "", "", ""),
                row("P11测试部分失败", "不存在的分类", "", "", "", "", "", "", "", "", "100", "", "", "", "", ""));

        FixedAssetImportService.FixedAssetImportResult res = importCsv(csv, false);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.PARTIAL);
        assertThat(res.createdAssets).isEqualTo(1);
        assertThat(res.failures).hasSize(1);
        assertThat(findOne(ASSETS, "name", "P11测试部分成功")).isNotNull();
        assertThat(findOne(ASSETS, "name", "P11测试部分失败")).isNull();
    }

    // -------------------------------------------------------------- 模板与控制器

    @Test
    @DisplayName("模板可原样使用：说明/示例行自动跳过，追加数据即可导入")
    void templateIsDirectlyUsable() throws Exception {
        String csv = fixedAssetService.templateCsv()
                + row("P11模板直用资产", "办公家具", "", "", "工位隔断", "华信科技集团有限公司", "行政部", "",
                "总部办公楼1层", "2026-01-06", "3000", "", "", "购买", "空闲", "是") + "\n";

        FixedAssetImportService.FixedAssetImportResult res = importWholeFile(csv, true);

        assertThat(res.status).isEqualTo(FixedAssetImportService.Status.OK);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.createdAssets).isEqualTo(1);
        assertThat(res.failures).isEmpty();
    }

    @Test
    @DisplayName("控制器：模板下载 / 单表上传")
    void controllerFlow() throws Exception {
        String template = mockMvc.perform(get("/api/data-import/fixed-asset-template")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(template).contains("资产名称").contains("资产分类").contains("使用人");

        String csv = HEADER + "\n"
                + row("P11控制器资产", "电子设备", "", "", "", "", "", "", "", "", "1200", "", "", "", "", "") + "\n";
        MockMultipartFile file = new MockMultipartFile("file", "fixed-assets.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/data-import/fixed-asset-upload?abortOnError=true")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(FixedAssetImportService.Status.OK))
                .andExpect(jsonPath("$.data.createdAssets").value(1))
                .andExpect(jsonPath("$.data.reusedAssets").value(0));
    }

    // -------------------------------------------------------------- 工具

    private FixedAssetImportService.FixedAssetImportResult importCsv(String data, boolean abortOnError)
            throws Exception {
        return importWholeFile(HEADER + "\n" + data + "\n", abortOnError);
    }

    private FixedAssetImportService.FixedAssetImportResult importWholeFile(String content, boolean abortOnError)
            throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "fixed-assets.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));
        return fixedAssetService.doImport(file, abortOnError);
    }

    /** 按模板列顺序拼一行：名称, 分类, 编号, 品牌, 型号, 公司, 部门, 使用人, 地点, 购置日期, 金额, 原值, 净值, 购置方式, 状态, 是否折旧 */
    private static String row(String name, String category, String code, String brand, String model,
                              String company, String dept, String user, String location,
                              String purchaseDate, String amount, String original, String net,
                              String mode, String status, String depreciate) {
        return String.join(",", name, category, code, brand, model, company, dept, user, location,
                purchaseDate, amount, original, net, mode, status, depreciate);
    }

    private Map<String, Object> findOne(String key, String... pairs) {
        return find(genericService.list(key, new HashMap<String, String[]>()), pairs);
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

    private static void assertNumber(Object actual, String expected) {
        assertThat(new BigDecimal(String.valueOf(actual))).isEqualByComparingTo(expected);
    }
}
