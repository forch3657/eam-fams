package com.fams.p4;

import com.fams.TestAccounts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fams.engine.GenericService;
import com.fams.security.LoginAttemptService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P4 低值资产验收：库存三段结算、退库限额与快照保护。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P4LowValueStockTest {

    private static final String ADMIN = TestAccounts.ADMIN;

    private static final String PASSWORD = TestAccounts.PASSWORD;

    private static final String ITEMS = "low-value-items";

    private static final String INBOUND = "low-value-inbound";

    private static final String REQUISITION = "low-value-requisition";

    private static final String RETURN = "low-value-return";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private GenericService genericService;

    @Autowired
    private LoginAttemptService loginAttemptService;

    private String token;

    @BeforeEach
    void login() throws Exception {
        loginAttemptService.loginSucceeded(ADMIN);
        if (token != null) {
            return;
        }
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(ADMIN, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        token = objectMapper.readTree(response).path("data").path("token").asText();
        assertThat(token).isNotBlank();
    }

    @Test
    @DisplayName("三段结算：DRAFT 不动库存 / PROCESSING 预占 / DONE 结算")
    void stockSettlementFollowsStatusMachine() throws Exception {
        String itemId = createItem("LV-T4-A");
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(0));

        Map<String, Object> inbound = doc(INBOUND, "IN-T4-A", itemId, 10, "DRAFT");
        String inboundId = createDoc(INBOUND, inbound);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));

        inbound.put("status", "PROCESSING");
        updateDoc(INBOUND, inboundId, inbound);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));

        inbound.put("status", "DONE");
        updateDoc(INBOUND, inboundId, inbound);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(110));

        Map<String, Object> requisition = doc(REQUISITION, "RQ-T4-A", itemId, 30, "DRAFT");
        String requisitionId = createDoc(REQUISITION, requisition);
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(0));

        requisition.put("status", "PROCESSING");
        updateDoc(REQUISITION, requisitionId, requisition);
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(30));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(110));

        requisition.put("status", "DONE");
        updateDoc(REQUISITION, requisitionId, requisition);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(80));
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(0));
    }

    @Test
    @DisplayName("撤销/驳回：释放预占且不动 stock")
    void rejectedReleasesReservationOnly() throws Exception {
        String itemId = createItem("LV-T4-B");

        Map<String, Object> requisition = doc(REQUISITION, "RQ-T4-B", itemId, 50, "PROCESSING");
        String requisitionId = createDoc(REQUISITION, requisition);
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(50));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));

        requisition.put("status", "REJECTED");
        updateDoc(REQUISITION, requisitionId, requisition);
        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(0));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));
    }

    @Test
    @DisplayName("删除已结算单据：库存按原数量反向回退")
    void deletingSettledDocRollsBackStock() throws Exception {
        String itemId = createItem("LV-T4-C");
        Map<String, Object> inbound = doc(INBOUND, "IN-T4-C", itemId, 15, "DONE");
        String inboundId = createDoc(INBOUND, inbound);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(115));

        mockMvc.perform(auth(delete("/api/" + INBOUND + "/" + inboundId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(true));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));
    }

    @Test
    @DisplayName("退库边界：正好够放行，超出 1 件返回 1006")
    void returnLimitBoundary() throws Exception {
        String itemId = createItem("LV-T4-D", 0);

        Map<String, Object> inbound = doc(INBOUND, "IN-T4-D", itemId, 20, "DONE");
        createDoc(INBOUND, inbound);
        Map<String, Object> requisition = doc(REQUISITION, "RQ-T4-D", itemId, 20, "DONE");
        createDoc(REQUISITION, requisition);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(0));

        // 正好够：已领 20，可退 20
        Map<String, Object> exact = doc(RETURN, "RT-T4-D1", itemId, 20, "DONE");
        createDoc(RETURN, exact);
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(20));

        // 超出：可退 0，却退 1
        Map<String, Object> over = doc(RETURN, "RT-T4-D2", itemId, 1, "DONE");
        String response = mockMvc.perform(auth(post("/api/" + RETURN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(over))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1006);
    }

    @Test
    @DisplayName("审批中的退库量计入占用：并发退库不会超退")
    void pendingReturnCountsAgainstLimit() throws Exception {
        String itemId = createItem("LV-T4-E", 0);
        createDoc(INBOUND, doc(INBOUND, "IN-T4-E", itemId, 10, "DONE"));
        createDoc(REQUISITION, doc(REQUISITION, "RQ-T4-E", itemId, 10, "DONE"));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(0));

        // 已领 10，审批中占用 6，则可退 4；退 5 应被拒
        Map<String, Object> pending = doc(RETURN, "RT-T4-E1", itemId, 6, "PROCESSING");
        createDoc(RETURN, pending);

        Map<String, Object> tooMuch = doc(RETURN, "RT-T4-E2", itemId, 5, "DONE");
        String response = mockMvc.perform(auth(post("/api/" + RETURN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(tooMuch))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(objectMapper.readTree(response).path("code").asInt()).isEqualTo(1006);

        // 退 4 正好放行
        Map<String, Object> ok = doc(RETURN, "RT-T4-E3", itemId, 4, "DONE");
        mockMvc.perform(auth(post("/api/" + RETURN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ok))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(4));
    }

    @Test
    @DisplayName("快照：新增时由服务端补全，更新时不可被覆盖")
    void snapshotFilledOnCreateAndPreservedOnUpdate() throws Exception {
        String itemId = createItem("LV-T4-F");
        Map<String, Object> item = genericService.get(ITEMS, itemId);

        Map<String, Object> inbound = doc(INBOUND, "IN-T4-F", itemId, 5, "DONE");
        String created = mockMvc.perform(auth(post("/api/" + INBOUND)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inbound))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode first = objectMapper.readTree(created).path("data");
        assertThat(first.path("itemName").asText()).isEqualTo(item.get("name").toString());

        String inboundId = first.path("id").asText();
        inbound.put("itemName", "被篡改的物品名");
        String updated = mockMvc.perform(auth(put("/api/" + INBOUND + "/" + inboundId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(inbound))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode second = objectMapper.readTree(updated).path("data");
        assertThat(second.path("itemName").asText()).isEqualTo(first.path("itemName").asText());
    }

    @Test
    @DisplayName("可用库存不足：领用单预占时返回 1001")
    void insufficientStockReturns1001() throws Exception {
        String itemId = createItem("LV-T4-G", 10);
        Map<String, Object> requisition = doc(REQUISITION, "RQ-T4-G", itemId, 11, "PROCESSING");
        String response = mockMvc.perform(auth(post("/api/" + REQUISITION)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(requisition))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).isEqualTo(1001);
    }

    @Test
    @DisplayName("并发领用不超卖：两个并发预占只能成功一个")
    void concurrentRequisitionDoesNotOversell() throws Exception {
        String itemId = createItem("LV-T4-H", 100);

        Callable<Integer> task = () -> {
            try {
                genericService.create(REQUISITION, doc(REQUISITION,
                        "RQ-T4-H-" + Thread.currentThread().getId(), itemId, 60, "PROCESSING"));
                return 0;
            } catch (RuntimeException ex) {
                return -1;
            }
        };
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            futures.add(pool.submit(task));
            futures.add(pool.submit(task));
            int success = 0;
            for (Future<Integer> future : futures) {
                if (future.get() == 0) {
                    success++;
                }
            }
            assertThat(success).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        assertThat(reservedOf(itemId)).isEqualByComparingTo(bd(60));
        assertThat(stockOf(itemId)).isEqualByComparingTo(bd(100));
    }

    // ------------------------------------------------------------------ 工具

    private String createItem(String prefix) throws Exception {
        return createItem(prefix, 100);
    }

    private String createItem(String prefix, int stock) throws Exception {
        Map<String, Object> item = new HashMap<>();
        item.put("code", prefix + "-" + System.nanoTime());
        item.put("name", prefix + " 物品");
        item.put("category", "OFFICE");
        item.put("spec", "500ml*24");
        item.put("unit", "箱");
        item.put("price", 36.5);
        item.put("stock", stock);
        item.put("reserved", 0);
        item.put("safetyStock", 5);
        item.put("location", "总部仓");
        item.put("status", "NORMAL");
        return createDoc(ITEMS, item);
    }

    private Map<String, Object> doc(String collection, String docNo, String itemId, int qty, String status) {
        Map<String, Object> row = new HashMap<>();
        if (ITEMS.equals(collection)) {
            return row;
        }
        row.put("docNo", docNo);
        row.put("itemId", itemId);
        row.put("quantity", qty);
        row.put("status", status);
        return row;
    }

    private String createDoc(String collection, Map<String, Object> row) throws Exception {
        String response = mockMvc.perform(auth(post("/api/" + collection)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(row))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = objectMapper.readTree(response);
        assertThat(node.path("code").asInt()).as(response).isEqualTo(0);
        return node.path("data").path("id").asText();
    }

    private void updateDoc(String collection, String id, Map<String, Object> row) throws Exception {
        String response = mockMvc.perform(auth(put("/api/" + collection + "/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(row))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(objectMapper.readTree(response).path("code").asInt()).as(response).isEqualTo(0);
    }

    private static BigDecimal bd(int value) {
        return BigDecimal.valueOf(value);
    }

    private BigDecimal stockOf(String itemId) {
        return new BigDecimal(genericService.get(ITEMS, itemId).get("stock").toString());
    }

    private BigDecimal reservedOf(String itemId) {
        Object value = genericService.get(ITEMS, itemId).get("reserved");
        return new BigDecimal(value == null ? "0" : value.toString());
    }

    private MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder builder) {
        return builder.header("Authorization", "Bearer " + token);
    }

    private String credentials(String username, String password) throws Exception {
        Map<String, String> map = new HashMap<>();
        map.put("username", username);
        map.put("password", password);
        return objectMapper.writeValueAsString(map);
    }
}
