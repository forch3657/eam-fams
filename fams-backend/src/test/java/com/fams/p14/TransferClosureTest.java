package com.fams.p14;

import com.fams.contract.EnumCatalog;
import com.fams.engine.GenericService;
import com.fams.module.approval.ApprovalService;
import com.fams.module.approval.ApprovalTrailWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

/**
 * D3 门禁 3 证据：跨公司转让完结闭环 —— 原卡核销 + 受让公司建新卡 + 幂等。
 * 直接验证 syncAssetLedger 调用的 transferOutClosure 私有逻辑（反射），隔离审批链配置依赖。
 */
class TransferClosureTest {

    private GenericService genericService;
    private ApprovalService service;
    private Method closure;

    @BeforeEach
    void setUp() throws Exception {
        genericService = Mockito.mock(GenericService.class);
        service = new ApprovalService(genericService,
                Mockito.mock(ApprovalTrailWriter.class), Mockito.mock(EnumCatalog.class));
        closure = ApprovalService.class.getDeclaredMethod("transferOutClosure", Map.class, String.class);
        closure.setAccessible(true);
    }

    @Test
    @DisplayName("转让完结：原卡置已转出 + 受让公司建新卡，空 SecurityContext 下不越权")
    void transferOutCreatesDerivedCard() throws Exception {
        Map<String, Object> asset = sampleAsset();
        Mockito.when(genericService.get("fixed-assets", "A1")).thenReturn(asset);
        Mockito.when(genericService.listInternal(eq("fixed-assets"), any()))
                .thenReturn(Collections.emptyList());
        Map<String, Object> created = new LinkedHashMap<>();
        created.put("id", "NEW1");
        Mockito.when(genericService.createIndependent(eq("fixed-assets"), any())).thenReturn(created);

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", "D1");
        doc.put("companyId", "C-Research");
        doc.put("transfereeCompanyId", "C-Zhizhen");
        doc.put("buyer", "至臻公司");
        doc.put("disposeType", "TRANSFER_OUT");

        closure.invoke(service, doc, "A1");

        // 原卡核销
        Mockito.verify(genericService).patchField("fixed-assets", "A1", "status", "TRANSFERRED_OUT", null);
        // 新卡落在受让公司
        ArgumentCaptor<Map> cap = ArgumentCaptor.forClass(Map.class);
        Mockito.verify(genericService).createIndependent(eq("fixed-assets"), cap.capture());
        Map card = cap.getValue();
        assertThat(card.get("companyId")).isEqualTo("C-Zhizhen");
        assertThat(card.get("status")).isEqualTo("IDLE");
        assertThat(String.valueOf(card.get("sourceTag"))).contains("TRANSFER_OUT:D1");
        assertThat(card.get("original")).isEqualTo(asset.get("original"));
    }

    @Test
    @DisplayName("幂等：已存在同源新卡时不再重复建卡")
    void transferOutIsIdempotent() throws Exception {
        Map<String, Object> asset = sampleAsset();
        Mockito.when(genericService.get("fixed-assets", "A1")).thenReturn(asset);
        Map<String, Object> existing = new LinkedHashMap<>();
        existing.put("id", "EXISTING");
        Mockito.when(genericService.listInternal(eq("fixed-assets"), any()))
                .thenReturn(Collections.singletonList(existing));

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", "D1");
        doc.put("companyId", "C-Research");
        doc.put("transfereeCompanyId", "C-Zhizhen");

        closure.invoke(service, doc, "A1");

        Mockito.verify(genericService).patchField("fixed-assets", "A1", "status", "TRANSFERRED_OUT", null);
        Mockito.verify(genericService, Mockito.never()).createIndependent(any(), any());
    }

    @Test
    @DisplayName("缺少受让公司：仅核销原卡，不建新卡")
    void missingTransfereeOnlyWritesOff() throws Exception {
        Mockito.when(genericService.get("fixed-assets", "A1")).thenReturn(sampleAsset());
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("id", "D1");
        doc.put("companyId", "C-Research");
        closure.invoke(service, doc, "A1");
        Mockito.verify(genericService).patchField("fixed-assets", "A1", "status", "TRANSFERRED_OUT", null);
        Mockito.verify(genericService, Mockito.never()).createIndependent(any(), any());
    }

    private static Map<String, Object> sampleAsset() {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("id", "A1");
        a.put("code", "ZC-001");
        a.put("name", "测试设备");
        a.put("category", "ELECTRONIC");
        a.put("companyId", "C-Research");
        a.put("location", "研发楼");
        a.put("original", 10000);
        a.put("amount", 9000);
        a.put("net", 8000);
        a.put("status", "IN_USE");
        return a;
    }
}
