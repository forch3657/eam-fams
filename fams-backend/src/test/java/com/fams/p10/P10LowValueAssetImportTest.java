package com.fams.p10;

import com.fams.TestAccounts;
import com.fams.engine.GenericService;
import com.fams.imports.LowValueAssetImportService;
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
 * P10 低值资产单表导入：一行 = 一个低值物品，期初库存直接写台账（不生成入库单），
 * 存放位置按名称匹配、不存在自动建档。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public class P10LowValueAssetImportTest {

    private static final String HEADER = String.join(",", LowValueAssetImportService.COLUMNS);
    private static final String ITEMS = LowValueAssetImportService.ITEMS;
    private static final String INBOUND = "low-value-inbound";
    private static final String LOCATIONS = LowValueAssetImportService.LOCATIONS;

    @Autowired
    private LowValueAssetImportService lowValueService;

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
    @DisplayName("一行建一个物品：期初库存直接写台账，且不生成入库单")
    void createItemWithStockDirectly() throws Exception {
        String csv = row("办公用品", "P10测试打印纸", "70g/500张", "包", "25.50", "100", "20", "行政库房", "正常", "");

        LowValueAssetImportService.LowValueImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.OK);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.createdItems).isEqualTo(1);
        assertThat(res.reusedItems).isZero();
        assertThat(res.createdLocations).isZero();
        assertThat(res.failures).isEmpty();

        Map<String, Object> item = findOne(ITEMS, "name", "P10测试打印纸");
        assertThat(item).isNotNull();
        assertThat(String.valueOf(item.get("code")))
                .startsWith("DZ" + LocalDate.now().getYear())
                .hasSize("DZ".length() + 4 + 4);
        assertThat(item.get("category")).isEqualTo("OFFICE");
        assertThat(item.get("unit")).isEqualTo("包");
        assertThat(item.get("location")).isEqualTo("行政库房");
        assertThat(item.get("status")).isEqualTo("NORMAL");
        assertNumber(item.get("stock"), "100");
        assertNumber(item.get("safetyStock"), "20");
        assertNumber(item.get("price"), "25.50");

        // 期初库存不走单据：不应产生任何入库单
        assertThat(findOne(INBOUND, "itemId", String.valueOf(item.get("id")))).isNull();
    }

    @Test
    @DisplayName("类别/状态支持中文，落库为枚举编码")
    void chineseCategoryAndStatus() throws Exception {
        String csv = row("水", "P10矿泉水", "5L*4瓶/箱", "箱", "42", "5", "1", "行政库房", "停用", "");

        LowValueAssetImportService.LowValueImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.OK);
        Map<String, Object> item = findOne(ITEMS, "name", "P10矿泉水");
        assertThat(item.get("category")).isEqualTo("WATER");
        assertThat(item.get("status")).isEqualTo("DISABLED");
    }

    @Test
    @DisplayName("存放位置不存在时自动建档，同一位置多行只建一次")
    void autoCreateLocationOnce() throws Exception {
        String csv = String.join("\n",
                row("办公用品", "P10位置物品A", "规格A", "个", "1", "2", "1", "P10临时库房", "正常", ""),
                row("办公用品", "P10位置物品B", "规格B", "个", "1", "2", "1", "P10临时库房", "正常", ""));

        LowValueAssetImportService.LowValueImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.OK);
        assertThat(res.createdItems).isEqualTo(2);
        assertThat(res.createdLocations).isEqualTo(1);
        Map<String, Object> location = findOne(LOCATIONS, "name", "P10临时库房");
        assertThat(location).isNotNull();
        assertThat(String.valueOf(location.get("code"))).startsWith("WZ-");
        assertThat(findOne(ITEMS, "name", "P10位置物品A").get("location")).isEqualTo("P10临时库房");
    }

    // -------------------------------------------------------------- 幂等

    @Test
    @DisplayName("重复导入同一文件：只复用，不重复累加库存")
    void reimportDoesNotDoubleStock() throws Exception {
        String csv = row("办公用品", "P10复用物品", "复用规格", "包", "9.90", "30", "5", "行政库房", "正常", "");

        assertThat(importCsv(csv, true).status).isEqualTo(LowValueAssetImportService.Status.OK);
        LowValueAssetImportService.LowValueImportResult again = importCsv(csv, true);

        assertThat(again.status).isEqualTo(LowValueAssetImportService.Status.OK);
        assertThat(again.createdItems).isZero();
        assertThat(again.reusedItems).isEqualTo(1);
        assertThat(again.createdLocations).isZero();
        assertNumber(findOne(ITEMS, "name", "P10复用物品").get("stock"), "30");
        assertThat(countByName(ITEMS, "P10复用物品")).isEqualTo(1);
    }

    @Test
    @DisplayName("填了物品编码时按编码复用，不改动库中已有数量与单价")
    void explicitCodeReusesExistingItem() throws Exception {
        Map<String, Object> before = findOne(ITEMS, "code", "DZ20260001");
        assertThat(before).isNotNull();

        String csv = row("办公用品", "得力7733优事贴", "(76×76mm)4色装", "包", "3.50", "999", "10", "行政库房", "正常", "DZ20260001");
        LowValueAssetImportService.LowValueImportResult res = importCsv(csv, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.OK);
        assertThat(res.createdItems).isZero();
        assertThat(res.reusedItems).isEqualTo(1);

        Map<String, Object> after = findOne(ITEMS, "code", "DZ20260001");
        assertNumber(after.get("stock"), String.valueOf(before.get("stock")));
        assertNumber(after.get("price"), String.valueOf(before.get("price")));
    }

    // -------------------------------------------------------------- 校验

    @Test
    @DisplayName("整批校验：类别非法 / 数字非法 / 缺单位 都会整批拒绝且零写入")
    void invalidRowsRejectWholeBatch() throws Exception {
        LowValueAssetImportService.LowValueImportResult category = importCsv(
                row("不存在的类别", "P10非法类别", "", "包", "1", "1", "0", "", "正常", ""), true);
        assertThat(category.status).isEqualTo(LowValueAssetImportService.Status.REJECTED_INVALID);
        assertThat(category.failures.get(0).message).contains("不合法");
        assertThat(category.createdItems).isZero();

        assertThat(importCsv(row("办公用品", "P10负库存", "", "包", "1", "-1", "0", "", "正常", ""), true)
                .failures.get(0).message).contains("不能为负数");

        assertThat(importCsv(row("办公用品", "P10小数库存", "", "包", "1", "1.5", "0", "", "正常", ""), true)
                .failures.get(0).message).contains("必须为整数");

        assertThat(importCsv(row("办公用品", "P10缺单位", "", "", "1", "1", "0", "", "正常", ""), true)
                .failures.get(0).message).contains("单位不能为空");

        assertThat(importCsv(row("办公用品", "P10单价非数字", "", "包", "abc", "1", "0", "", "正常", ""), true)
                .failures.get(0).message).contains("应为数字");

        assertThat(findOne(ITEMS, "name", "P10负库存")).isNull();
        assertThat(findOne(ITEMS, "name", "P10缺单位")).isNull();
    }

    @Test
    @DisplayName("同一物品在文件中出现多行会报错，避免库存口径不清")
    void duplicateRowsInFileRejected() throws Exception {
        String line = row("办公用品", "P10重复物品", "同规格", "包", "1", "5", "0", "", "正常", "");
        LowValueAssetImportService.LowValueImportResult res = importCsv(line + "\n" + line, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.REJECTED_INVALID);
        assertThat(res.failures.get(0).row).isEqualTo(3);
        assertThat(res.failures.get(0).message).contains("重复出现");
        assertThat(findOne(ITEMS, "name", "P10重复物品")).isNull();
    }

    @Test
    @DisplayName("逐行模式：错误行跳过，其余正常写入")
    void partialModeKeepsValidRows() throws Exception {
        String csv = String.join("\n",
                row("办公用品", "P10部分成功物品", "规格", "个", "2", "6", "1", "", "正常", ""),
                row("办公用品", "P10部分失败物品", "", "", "1", "1", "0", "", "正常", ""));

        LowValueAssetImportService.LowValueImportResult res = importCsv(csv, false);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.PARTIAL);
        assertThat(res.createdItems).isEqualTo(1);
        assertThat(res.failures).hasSize(1);
        assertThat(findOne(ITEMS, "name", "P10部分成功物品")).isNotNull();
        assertThat(findOne(ITEMS, "name", "P10部分失败物品")).isNull();
    }

    // -------------------------------------------------------------- 模板与控制器

    @Test
    @DisplayName("模板可原样使用：说明/示例行自动跳过，追加数据即可导入")
    void templateIsDirectlyUsable() throws Exception {
        String csv = lowValueService.templateCsv()
                + row("纸品", "P10模板直用纸", "A4/80g", "包", "23.00", "12", "3", "总部办公楼2层", "正常", "") + "\n";

        LowValueAssetImportService.LowValueImportResult res = importWholeFile(csv, true);

        assertThat(res.status).isEqualTo(LowValueAssetImportService.Status.OK);
        assertThat(res.total).isEqualTo(1);
        assertThat(res.createdItems).isEqualTo(1);
        assertThat(res.createdLocations).isZero();
        assertNumber(findOne(ITEMS, "name", "P10模板直用纸").get("stock"), "12");
    }

    @Test
    @DisplayName("控制器：模板下载 / 单表上传")
    void controllerFlow() throws Exception {
        String template = mockMvc.perform(get("/api/data-import/low-value-template")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(template).contains("物品类别").contains("期初库存").contains("存放位置");

        String csv = HEADER + "\n"
                + row("办公用品", "P10控制器物品", "控制器规格", "个", "1.00", "3", "1", "", "正常", "") + "\n";
        MockMultipartFile file = new MockMultipartFile("file", "low-value.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/data-import/low-value-upload?abortOnError=true")
                        .file(file)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(LowValueAssetImportService.Status.OK))
                .andExpect(jsonPath("$.data.createdItems").value(1))
                .andExpect(jsonPath("$.data.reusedItems").value(0));
    }

    // -------------------------------------------------------------- 工具

    private LowValueAssetImportService.LowValueImportResult importCsv(String data, boolean abortOnError)
            throws Exception {
        return importWholeFile(HEADER + "\n" + data + "\n", abortOnError);
    }

    private LowValueAssetImportService.LowValueImportResult importWholeFile(String content, boolean abortOnError)
            throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "low-value.csv", "text/csv",
                content.getBytes(StandardCharsets.UTF_8));
        return lowValueService.doImport(file, abortOnError);
    }

    /** 按模板列顺序拼一行：类别, 名称, 规格, 单位, 单价, 期初库存, 安全库存, 存放位置, 状态, 物品编码 */
    private static String row(String category, String name, String spec, String unit, String price,
                              String stock, String safety, String location, String status, String code) {
        return String.join(",", category, name, spec, unit, price, stock, safety, location, status, code);
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

    private int countByName(String key, String name) {
        int count = 0;
        for (Map<String, Object> row : genericService.list(key, new HashMap<String, String[]>())) {
            if (name.equals(String.valueOf(row.get("name")))) {
                count++;
            }
        }
        return count;
    }

    private static void assertNumber(Object actual, String expected) {
        assertThat(new BigDecimal(String.valueOf(actual))).isEqualByComparingTo(expected);
    }
}
