package com.fams.p17;

import com.fams.common.ApiException;
import com.fams.common.R;
import com.fams.engine.GenericService;
import com.fams.module.inventory.InventoryScanController;
import com.fams.module.inventory.InventoryScanService;
import com.fams.security.UserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 扫码盘点逐条合并服务的分支单测。
 *
 * <p>不启动 Spring 容器：mock {@link GenericService} 的读/写，直接设置登录主体，
 * 覆盖参数校验、单据状态、分派越权、幂等、重复扫、清单外、改判、盘点员进度回算
 * 以及控制器权限门禁。这些分支若只靠集成测试很难全部走到。</p>
 */
class P17InventoryScanTest {

    private static final String DOCS = "fixed-asset-inventory-docs";
    private static final String DOC_ID = "IV-SCAN-1";

    private GenericService genericService;
    private InventoryScanService service;
    private InventoryScanController controller;

    @BeforeEach
    void setUp() {
        genericService = Mockito.mock(GenericService.class);
        service = new InventoryScanService(genericService);
        controller = new InventoryScanController(service);
        loginAs("U-ADMIN", "管理员", "admin", "R1", "fa:inventory");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    // ------------------------------------------------------------------ 工夹具

    private static void loginAs(String id, String name, String username, String roleId, String... permissions) {
        Map<String, Object> user = new HashMap<>();
        user.put("id", id);
        user.put("name", name);
        user.put("username", username);
        user.put("roleIds", Collections.singletonList(roleId));
        UserPrincipal principal = new UserPrincipal(user,
                new LinkedHashSet<>(Arrays.asList(permissions)), "ALL");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private static Map<String, Object> item(String assetNo, String result, String checker, String scanId) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("assetId", "ASSET-" + assetNo);
        item.put("assetNo", assetNo);
        item.put("assetName", "资产 " + assetNo);
        item.put("result", result);
        item.put("itemStatus", "UNCHECKED");
        item.put("remark", "");
        item.put("checker", checker);
        item.put("checkerName", "");
        if (scanId != null) {
            item.put("scanId", scanId);
        }
        return item;
    }

    private static Map<String, Object> counter(String userId, String name, int assigned) {
        Map<String, Object> counter = new LinkedHashMap<>();
        counter.put("userId", userId);
        counter.put("name", name);
        counter.put("assigned", assigned);
        counter.put("done", 0);
        counter.put("status", "COUNTING");
        return counter;
    }

    /** 构造单据并让 genericService.get 返回它；update 回写 version=2 */
    private Map<String, Object> givenDoc(String status, List<Map<String, Object>> items,
                                         List<Map<String, Object>> counters) {
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", DOC_ID);
        doc.put("docNo", "PD-SCAN-001");
        doc.put("name", "扫码测试盘点单");
        doc.put("status", status);
        doc.put("scope", "全部资产");
        doc.put("items", items);
        doc.put("counters", counters);
        doc.put("version", 1);
        Mockito.when(genericService.get(DOCS, DOC_ID)).thenReturn(doc);
        Map<String, Object> saved = new LinkedHashMap<>(doc);
        saved.put("version", 2);
        Mockito.when(genericService.update(Mockito.eq(DOCS), Mockito.eq(DOC_ID), Mockito.anyMap()))
                .thenReturn(saved);
        return doc;
    }

    private static Map<String, Object> payload(String assetNo, String result, String remark,
                                               String disposal, String scanId, boolean overwrite) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("assetNo", assetNo);
        body.put("result", result);
        body.put("remark", remark);
        body.put("disposal", disposal);
        body.put("clientScanId", scanId);
        body.put("overwrite", overwrite);
        return body;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> capturedItems() {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(genericService).update(Mockito.eq(DOCS), Mockito.eq(DOC_ID), captor.capture());
        return (List<Map<String, Object>>) captor.getValue().get("items");
    }

    // ------------------------------------------------------------------ 参数与状态校验

    @Test
    @DisplayName("缺少资产编号 / 非法结果 / 差异缺原因 / 异常缺去向，均 400")
    void validationBranches() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.emptyList());

        assertThatThrownBy(() -> service.record(DOC_ID, payload("", "MATCHED", "", "", "s1", false)))
                .isInstanceOf(ApiException.class).extracting(e -> ((ApiException) e).getCode()).isEqualTo(400);

        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "BAD", "", "", "s1", false)))
                .isInstanceOf(ApiException.class).extracting(e -> ((ApiException) e).getCode()).isEqualTo(400);

        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "LOSS", "", "", "s1", false)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("必须填写原因");

        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "ABNORMAL", "损坏", "", "s1", false)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("处理去向");

        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "ABNORMAL", "损坏", "BAD", "s1", false)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("处理去向");
        Mockito.verify(genericService, Mockito.never()).update(Mockito.anyString(), Mockito.anyString(), Mockito.anyMap());
    }

    @Test
    @DisplayName("空 result 默认账实相符；非异常结果强制清空 disposal")
    void defaultResultAndDisposalCleared() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.singletonList(counter("U-ADMIN", "管理员", 1)));

        Map<String, Object> body = payload("A1", "", "", "REPAIR", "scan-default", false);
        Map<String, Object> res = service.record(DOC_ID, body);

        assertThat(res.get("status")).isEqualTo("RECORDED");
        Map<String, Object> saved = capturedItems().get(0);
        assertThat(saved.get("result")).isEqualTo("MATCHED");
        assertThat(saved.get("itemStatus")).isEqualTo("CHECKED");
        assertThat(saved.get("disposal")).isEqualTo("");
        assertThat(saved.get("checker")).isEqualTo("U-ADMIN");
        assertThat(saved.get("checkerName")).isEqualTo("管理员");
        assertThat(saved.get("checkTime")).asString().isNotBlank();
        assertThat(saved.get("scanId")).isEqualTo("scan-default");
    }

    @Test
    @DisplayName("审批中 / 已完结单据不可登记，返回 409")
    void immutableDocStatus() {
        givenDoc("PROCESSING", new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null))),
                Collections.emptyList());
        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false)))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(((ApiException) e).getCode()).isEqualTo(409);
                    assertThat(e.getMessage()).contains("只读");
                });
    }

    @Test
    @DisplayName("未登录直接调服务返回 401")
    void requiresLogin() {
        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false)))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(401);
        assertThatThrownBy(() -> service.availableDocs())
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(401);
    }

    @Test
    @DisplayName("非分派盘点员被 403 拦住并点名本单盘点员；未分派的历史单据放行")
    void assignmentGuard() {
        // 换成非管理员账号，避免 R1 维护通道
        loginAs("U-OTHER", "访客", "guest", "R9", "fa:inventory");
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.singletonList(counter("U-ADMIN", "管理员", 1)));

        assertThatThrownBy(() -> service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false)))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(((ApiException) e).getCode()).isEqualTo(403);
                    assertThat(e.getMessage()).contains("管理员");
                });

        // counters 为空的历史单据：持 fa:inventory 即可登记
        givenDoc("DRAFT", new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null))),
                Collections.emptyList());
        assertThat(service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s2", false)).get("status"))
                .isEqualTo("RECORDED");
    }

    @Test
    @DisplayName("系统管理员 R1 走维护通道，可盘点分派给他人的未送审单据")
    void adminMaintenanceChannel() {
        // setUp 已是 R1；counters 只分派给另一个人
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.singletonList(counter("U-OTHER", "同事", 1)));

        assertThat(service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false)).get("status"))
                .isEqualTo("RECORDED");
        Mockito.when(genericService.list(Mockito.eq(DOCS), Mockito.anyMap()))
                .thenReturn(Collections.emptyList());
        assertThat(controller.docs().getCode()).isZero();
    }

    // ------------------------------------------------------------------ 业务分支

    @Test
    @DisplayName("同一 clientScanId 重试返回 IDEMPOTENT 且不写库")
    void idempotentRetry() {
        List<Map<String, Object>> items = new ArrayList<>(
                Arrays.asList(item("A1", "MATCHED", "U-ADMIN", "scan-1")));
        givenDoc("DRAFT", items, Collections.emptyList());

        Map<String, Object> res = service.record(DOC_ID, payload("A1", "MATCHED", "", "", "scan-1", false));

        assertThat(res.get("status")).isEqualTo("IDEMPOTENT");
        assertThat(res.get("assetNo")).isEqualTo("A1");
        Mockito.verify(genericService, Mockito.never()).update(Mockito.anyString(), Mockito.anyString(), Mockito.anyMap());
    }

    @Test
    @DisplayName("清单外资产返回 NOT_IN_SCOPE，引导登记账外资产")
    void notInScope() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.emptyList());

        Map<String, Object> res = service.record(DOC_ID, payload("A-X", "MATCHED", "", "", "s1", false));

        assertThat(res.get("status")).isEqualTo("NOT_IN_SCOPE");
        assertThat(res.get("assetNo")).isEqualTo("A-X");
        assertThat(res.get("message")).asString().contains("账外资产");
        Mockito.verify(genericService, Mockito.never()).update(Mockito.anyString(), Mockito.anyString(), Mockito.anyMap());
    }

    @Test
    @DisplayName("重复扫返回 DUPLICATE；显式 overwrite 才改判并保留原备注")
    void duplicateAndOverwrite() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(
                item("A1", "MATCHED", "U-ADMIN", "old-scan")));
        items.get(0).put("remark", "现场核对无误");
        givenDoc("DRAFT", items, Collections.emptyList());

        Map<String, Object> dup = service.record(DOC_ID, payload("A1", "LOSS", "找不到实物", "", "s1", false));
        assertThat(dup.get("status")).isEqualTo("DUPLICATE");
        Mockito.verify(genericService, Mockito.never()).update(Mockito.anyString(), Mockito.anyString(), Mockito.anyMap());

        Map<String, Object> changed = service.record(DOC_ID, payload("A1", "LOSS", "找不到实物", "", "s2", true));
        assertThat(changed.get("status")).isEqualTo("RECORDED");
        Map<String, Object> saved = capturedItems().get(0);
        assertThat(saved.get("result")).isEqualTo("LOSS");
        assertThat(saved.get("itemStatus")).isEqualTo("LOSS");
        assertThat(saved.get("remark")).asString().contains("改判自").contains("现场核对无误");
    }

    @Test
    @DisplayName("异常明细写入处理去向；盘盈结果派生 SURPLUS 状态")
    void abnormalAndSurplus() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(
                item("A1", "UNCHECKED", "", null), item("A2", "UNCHECKED", "", null)));
        givenDoc("DRAFT", items, Collections.emptyList());

        service.record(DOC_ID, payload("A1", "ABNORMAL", "标签破损", "REPAIR", "s1", false));
        List<Map<String, Object>> saved = capturedItems();
        assertThat(saved.get(0).get("disposal")).isEqualTo("REPAIR");
        assertThat(saved.get(0).get("itemStatus")).isEqualTo("ABNORMAL");

        Mockito.reset(genericService);
        givenDoc("DRAFT", new ArrayList<>(Arrays.asList(item("A2", "UNCHECKED", "", null))),
                Collections.emptyList());
        service.record(DOC_ID, payload("A2", "SURPLUS", "账外设备", "", "s2", false));
        assertThat(capturedItems().get(0).get("itemStatus")).isEqualTo("SURPLUS");
    }

    @Test
    @DisplayName("逐条合并携带 version 走乐观锁，并回算各盘点员 done/status")
    void versionAndCounterProgress() {
        List<Map<String, Object>> items = new ArrayList<>(Arrays.asList(
                item("A1", "UNCHECKED", "", null),
                item("A2", "MATCHED", "U-ADMIN", "seed")));
        List<Map<String, Object>> counters = new ArrayList<>(Arrays.asList(
                counter("U-ADMIN", "管理员", 2),
                counter("U-OTHER", "同事", 5)));
        counters.get(1).put("assigned", "bad-number");
        givenDoc("DRAFT", items, counters);

        Map<String, Object> res = service.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false));

        assertThat(res.get("status")).isEqualTo("RECORDED");
        assertThat(res.get("counted")).isEqualTo(2L);
        assertThat(res.get("total")).isEqualTo(2);
        assertThat(res.get("version")).isEqualTo(2);

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(genericService).update(Mockito.eq(DOCS), Mockito.eq(DOC_ID), captor.capture());
        assertThat(captor.getValue().get("version")).isEqualTo(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> savedCounters = (List<Map<String, Object>>) captor.getValue().get("counters");
        assertThat(savedCounters.get(0).get("done")).isEqualTo(2L);
        assertThat(savedCounters.get(0).get("status")).isEqualTo("DONE");
        assertThat(savedCounters.get(1).get("done")).isEqualTo(0L);
        assertThat(savedCounters.get(1).get("status")).isEqualTo("COUNTING");
    }

    // ------------------------------------------------------------------ 控制器与可盘单据

    @Test
    @DisplayName("可盘单据只返回草稿/驳回且分派给本人的单，并给出进度摘要")
    void availableDocsFiltering() {
        // 用普通盘点员：R1 管理员走维护通道会放行所有未送审单据，测不出分派过滤
        loginAs("U-COUNTER", "盘点员", "counter", "R9", "fa:inventory");
        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("id", "D1");
        draft.put("docNo", "PD-1");
        draft.put("name", "草稿单");
        draft.put("status", "DRAFT");
        draft.put("scope", "全部资产");
        draft.put("items", Arrays.asList(item("A1", "MATCHED", "U-COUNTER", null)));
        draft.put("counters", Collections.singletonList(counter("U-COUNTER", "盘点员", 1)));

        Map<String, Object> rejected = new LinkedHashMap<>(draft);
        rejected.put("id", "D2");
        rejected.put("status", "REJECTED");
        rejected.put("items", Arrays.asList(item("A1", "UNCHECKED", "", null)));

        Map<String, Object> processing = new LinkedHashMap<>(draft);
        processing.put("id", "D3");
        processing.put("status", "PROCESSING");

        Map<String, Object> otherAssignee = new LinkedHashMap<>(draft);
        otherAssignee.put("id", "D4");
        otherAssignee.put("counters", Collections.singletonList(counter("U-OTHER", "同事", 1)));

        Mockito.when(genericService.list(Mockito.eq(DOCS), Mockito.anyMap()))
                .thenReturn(Arrays.asList(draft, rejected, processing, otherAssignee));

        List<Map<String, Object>> rows = controller.docs().getData();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).get("id")).isEqualTo("D1");
        assertThat(rows.get(0).get("counted")).isEqualTo(1L);
        assertThat(rows.get(0).get("total")).isEqualTo(1);
        assertThat(rows.get(1).get("id")).isEqualTo("D2");
    }

    @Test
    @DisplayName("控制器缺 fa:inventory 一律 403；持权限时两个端点正常返回信封")
    void controllerPermissionGate() {
        loginAs("U-GUEST", "访客", "guest", "R9", "fa:view");
        assertThatThrownBy(() -> controller.docs())
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(403);
        assertThatThrownBy(() -> controller.record(DOC_ID, null))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(403);

        loginAs("U-ADMIN", "管理员", "admin", "R1", "fa:inventory");
        Mockito.when(genericService.list(Mockito.eq(DOCS), Mockito.anyMap()))
                .thenReturn(Collections.emptyList());
        R<List<Map<String, Object>>> ok = controller.docs();
        assertThat(ok.getCode()).isZero();
        assertThat(ok.getData()).isEmpty();

        givenDoc("DRAFT", new ArrayList<>(Arrays.asList(item("A1", "UNCHECKED", "", null))),
                Collections.emptyList());
        R<Map<String, Object>> recorded = controller.record(DOC_ID, payload("A1", "MATCHED", "", "", "s1", false));
        assertThat(recorded.getCode()).isZero();
        assertThat(recorded.getData().get("status")).isEqualTo("RECORDED");
    }

    @Test
    @DisplayName("空 body 与未登录主体不会绕过参数/身份校验")
    void nullBodyAndAnonymous() {
        assertThatThrownBy(() -> controller.record(DOC_ID, null))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(400);

        SecurityContextHolder.clearContext();
        assertThatThrownBy(() -> controller.docs())
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo(403);
    }
}
