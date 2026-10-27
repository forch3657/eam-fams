package com.fams.p8;

import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.imports.DataImportService;
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

import java.io.ByteArrayOutputStream;
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
 * P8 通用数据导入：复用契约引擎（RowCodec / RuleEngine / GenericService.create）的批量落库链路，
 * 并验证导入控制器端点（元数据 / 模板下载 / 上传）。
 *
 * <p>演示账号为 {@code admin / Fzidt@123}（见 {@link com.fams.TestAccounts}）。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class P8DataImportTest {

    @Autowired
    private DataImportService importService;

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
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(TestAccounts.ADMIN, TestAccounts.PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response)
                .path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    private long count(String key) {
        return genericService.list(key, new HashMap<String, String[]>()).size();
    }

    private static String credentials(String username, String password) throws Exception {
        Map<String, String> map = new HashMap<>();
        map.put("username", username);
        map.put("password", password);
        return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(map);
    }

    // -------------------------------------------------------------- 服务层

    @Test
    @DisplayName("列出可导入资源并生成带说明/示例的 CSV 模板")
    public void metaAndTemplate() {
        List<DataImportService.ResourceInfo> resources = importService.listResources();
        assertThat(resources).isNotEmpty();
        DataImportService.ResourceInfo dict = resources.stream()
                .filter(r -> "system-dict-types".equals(r.key))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("system-dict-types 未找到"));
        assertThat(dict.fields).isNotEmpty();

        String tpl = importService.templateCsv("system-dict-types");
        String[] lines = tpl.split("\n");
        assertThat(lines.length).isGreaterThanOrEqualTo(3);
        assertThat(lines[0]).contains("code").contains("name").contains("status");
        assertThat(lines[1]).startsWith("#说明");
        assertThat(lines[2]).startsWith("#示例");
        // 枚举字段的说明里必须列出可选值，业务人员才知道该填什么
        assertThat(lines[1]).contains("可选值").contains("ENABLED");
        // 示例行必须给出贴近业务的取值，而不是泛泛的「示例」
        assertThat(lines[2]).contains("asset_status").contains("资产状态");
    }

    @Test
    @DisplayName("模板可原样使用：说明/示例行自动跳过，追加数据即可导入")
    public void templateIsDirectlyUsable() throws Exception {
        String tpl = importService.templateCsv("system-dict-types");
        // 模板列为 code,name,count,status,remark，追加行必须按列对齐
        String csv = tpl + "TEST_DICT_TPL,模板直用,0,ENABLED,\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, true);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.success).isEqualTo(1);
        assertThat(res.status).isEqualTo("OK");
    }

    @Test
    @DisplayName("模板直用时错误行号按真实表格行定位")
    public void templateRowNumberIsAccurate() throws Exception {
        String tpl = importService.templateCsv("system-dict-types");
        String csv = tpl + "TEST_DICT_TPL_BAD,,0,ENABLED,\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, true);
        assertThat(res.status).isEqualTo("REJECTED_INVALID");
        assertThat(res.failures).hasSize(1);
        // 第 1 行表头、第 2 行说明、第 3 行示例，数据在第 4 行
        assertThat(res.failures.get(0).row).isEqualTo(4);
    }

    @Test
    @DisplayName("CSV 导入字典类型并落库")
    public void importCsvOk() throws Exception {
        long before = count("system-dict-types");
        String csv = "code,name,status\nTEST_DICT_IMPORT,导入测试,ENABLED\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, true);
        assertThat(res.status).isEqualTo("OK");
        assertThat(res.success).isEqualTo(1);
        assertThat(count("system-dict-types")).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("校验失败（必填为空）整体拒绝，不落库")
    public void importRejectedOnInvalid() throws Exception {
        String csv = "code,name,status\nTEST_DICT_BAD,,ENABLED\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, true);
        assertThat(res.status).isEqualTo("REJECTED_INVALID");
        assertThat(res.success).isEqualTo(0);
        assertThat(res.failures).isNotEmpty();
    }

    @Test
    @DisplayName("XLSX 导入字典类型并落库")
    public void importXlsxOk() throws Exception {
        org.apache.poi.xssf.usermodel.XSSFWorkbook wb = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
        org.apache.poi.ss.usermodel.Sheet sheet = wb.createSheet();
        org.apache.poi.ss.usermodel.Row h = sheet.createRow(0);
        h.createCell(0).setCellValue("code");
        h.createCell(1).setCellValue("name");
        h.createCell(2).setCellValue("status");
        org.apache.poi.ss.usermodel.Row r = sheet.createRow(1);
        r.createCell(0).setCellValue("TEST_DICT_XLSX");
        r.createCell(1).setCellValue("XLSX测试");
        r.createCell(2).setCellValue("ENABLED");
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.close();
        MockMultipartFile file = new MockMultipartFile("file", "t.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bos.toByteArray());
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, true);
        assertThat(res.status).isEqualTo("OK");
        assertThat(res.success).isEqualTo(1);
    }

    @Test
    @DisplayName("非中止模式：单行走失败不阻断其余行")
    public void importPartialContinue() throws Exception {
        String csv = "code,name,status\n"
                + "TEST_DICT_OK1,正常1,ENABLED\n"
                + "TEST_DICT_BAD2,,ENABLED\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        DataImportService.ImportResult res = importService.doImport("system-dict-types", file, false);
        assertThat(res.status).isEqualTo("PARTIAL");
        assertThat(res.success).isEqualTo(1);
        assertThat(res.failures).hasSize(1);
    }

    // -------------------------------------------------------------- 控制器层

    @Test
    @DisplayName("控制器：资源列表 / 模板下载 / 上传导入")
    public void controllerFlow() throws Exception {
        mockMvc.perform(get("/api/data-import/resources").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());

        mockMvc.perform(get("/api/data-import/template?key=system-dict-types")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        long before = count("system-dict-types");
        String csv = "code,name,status\nTEST_DICT_CTRL,控制器导入,ENABLED\n";
        MockMultipartFile file = new MockMultipartFile("file", "t.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/data-import/upload?key=system-dict-types&abortOnError=true")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OK"))
                .andExpect(jsonPath("$.data.success").value(1));
        assertThat(count("system-dict-types")).isEqualTo(before + 1);
    }
}
