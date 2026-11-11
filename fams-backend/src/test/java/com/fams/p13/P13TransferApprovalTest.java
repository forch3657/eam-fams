package com.fams.p13;

import com.fams.engine.GenericService;
import com.fams.module.approval.ApprovalSupport;
import com.fams.module.approval.ApproverResolver;
import com.fams.security.UserPrincipal;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 调拨审批链新增能力的单元验收（2026-11-11）：
 * 两类使用人审批人 + HAS_ASSET_USER 条件 + 服务端快照口径。
 */
class P13TransferApprovalTest {

    private static Map<String, Object> step(String approverType, String conditionType) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("key", "x1");
        s.put("name", "测试环节");
        s.put("approverType", approverType);
        s.put("conditionType", conditionType);
        return s;
    }

    private static GenericService serviceWithUser(String status) {
        GenericService service = mock(GenericService.class);
        Map<String, Object> user = new HashMap<>();
        user.put("id", "U3");
        user.put("status", status);
        when(service.get(eq("org-users"), anyString())).thenReturn(user);
        return service;
    }

    /** 项目按 Java 8 编译，不能用 Map.of / List.of / Set.of */
    private static Map<String, Object> ctx(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    @Test
    void hasAssetUserConditionOnlyAppliesWhenAssetHasUser() {
        Map<String, Object> s = step("ASSET_CURRENT_USER", "HAS_ASSET_USER");
        assertTrue(ApprovalSupport.stepApplies(s, ctx("hasAssetUser", true)));
        assertFalse(ApprovalSupport.stepApplies(s, ctx("hasAssetUser", false)));
        assertFalse(ApprovalSupport.stepApplies(s, new HashMap<>()));
        // 空闲资产跳过交出确认，其余环节仍生效
        assertTrue(ApprovalSupport.stepApplies(step("DOC_TARGET_USER", "NONE"), new HashMap<>()));
    }

    @Test
    void transferUserTypesArePersonScopedAndLabelled() {
        assertTrue(ApproverResolver.isPersonScoped(step("ASSET_CURRENT_USER", "NONE")));
        assertTrue(ApproverResolver.isPersonScoped(step("DOC_TARGET_USER", "NONE")));
        assertFalse(ApproverResolver.isPersonScoped(step("ROLE", "NONE")));
        assertEquals("现任资产使用人", ApproverResolver.personLabel("ASSET_CURRENT_USER"));
        assertEquals("调拨后新使用人", ApproverResolver.personLabel("DOC_TARGET_USER"));
        assertEquals("角色成员", ApproverResolver.personLabel("ROLE"));
    }

    @Test
    void resolveFromServerSnapshotAndTargetUser() {
        GenericService service = serviceWithUser("ENABLED");
        Map<String, Object> doc = new HashMap<>();
        doc.put("beforeUserId", "U_OLD");
        doc.put("toUserId", "U_NEW");
        assertEquals(Collections.singleton("U_OLD"),
                ApproverResolver.resolve(service, step("ASSET_CURRENT_USER", "NONE"), "D6", doc));
        assertEquals(Collections.singleton("U_NEW"),
                ApproverResolver.resolve(service, step("DOC_TARGET_USER", "NONE"), "D6", doc));
        assertTrue(ApproverResolver.resolve(service, step("ASSET_CURRENT_USER", "NONE"), "D6", Collections.emptyMap()).isEmpty());
        assertTrue(ApproverResolver.resolve(service, step("DOC_TARGET_USER", "NONE"), "D6", Collections.emptyMap()).isEmpty());
        assertEquals(1, ApproverResolver.unresolvedStepNames(service,
                Collections.singletonList(step("DOC_TARGET_USER", "NONE")), "D6", Collections.emptyMap()).size());
        assertEquals(0, ApproverResolver.unresolvedStepNames(service,
                Collections.singletonList(step("DOC_TARGET_USER", "NONE")), "D6", doc).size());
    }

    @Test
    void disabledUserCannotApprove() {
        GenericService service = serviceWithUser("DISABLED");
        Map<String, Object> doc = Collections.singletonMap("toUserId", "U3");
        assertTrue(ApproverResolver.resolve(service, step("DOC_TARGET_USER", "NONE"), "D6", doc).isEmpty());
    }

    @Test
    void deptIdOfFollowsDocumentAssetCreatorChain() {
        GenericService service = mock(GenericService.class);
        Map<String, Object> doc = new HashMap<>();
        doc.put("deptId", "D1");
        assertEquals("D1", ApproverResolver.deptIdOf(service, doc));

        doc.remove("deptId");
        doc.put("assetId", "A1");
        when(service.get(eq("fixed-assets"), eq("A1"))).thenReturn(Collections.singletonMap("deptId", "D2"));
        assertEquals("D2", ApproverResolver.deptIdOf(service, doc));

        when(service.get(eq("fixed-assets"), eq("A1"))).thenReturn(Collections.emptyMap());
        doc.put("creatorId", "U9");
        when(service.get(eq("org-users"), eq("U9"))).thenReturn(Collections.singletonMap("deptId", "D3"));
        assertEquals("D3", ApproverResolver.deptIdOf(service, doc));
        assertEquals("", ApproverResolver.deptIdOf(service, null));
    }

    @Test
    void personLabelsCoverAllTypes() {
        assertEquals("部门负责人", ApproverResolver.personLabel("DEPT_LEADER"));
        assertEquals("上级部门负责人", ApproverResolver.personLabel("PARENT_DEPT_LEADER"));
        assertEquals("分管领导", ApproverResolver.personLabel("DEPT_VP"));
        assertEquals("指定审批人", ApproverResolver.personLabel("USER"));
        assertEquals("ROLE", ApproverResolver.personLabel(""));
    }

    private static UserPrincipal principal(String dataScope, String... perms) {
        Map<String, Object> user = new HashMap<>();
        user.put("id", "U3");
        user.put("username", "u3");
        user.put("name", "测试账号");
        user.put("password", "x");
        user.put("companyId", "C1");
        user.put("deptId", "D1");
        user.put("roleIds", Collections.singletonList("R3"));
        return new UserPrincipal(user, new LinkedHashSet<>(Arrays.asList(perms)), dataScope);
    }

    @Test
    void hasBorrowerConditionAndDocBorrowerResolver() {
        Map<String, Object> s = step("DOC_BORROWER", "HAS_BORROWER");
        assertTrue(ApprovalSupport.stepApplies(s, ctx("hasBorrower", true)));
        assertFalse(ApprovalSupport.stepApplies(s, ctx("hasBorrower", false)));
        assertFalse(ApprovalSupport.stepApplies(s, new HashMap<>()));
        assertTrue(ApproverResolver.isPersonScoped(step("DOC_BORROWER", "NONE")));
        assertEquals("借出借用人", ApproverResolver.personLabel("DOC_BORROWER"));

        GenericService service = serviceWithUser("ENABLED");
        Map<String, Object> doc = Collections.singletonMap("borrowerId", "U_NEW");
        assertEquals(Collections.singleton("U_NEW"),
                ApproverResolver.resolve(service, step("DOC_BORROWER", "NONE"), "D6", doc));
        assertTrue(ApproverResolver.resolve(service, step("DOC_BORROWER", "NONE"), "D6", Collections.emptyMap()).isEmpty());
    }

    @Test
    void deptOnlyApproverCanSeeTodosCreatedByOthers() {
        UserPrincipal r3 = principal("DEPT_ONLY", "fa:view", "wm:todo");
        assertTrue(GenericService.approverNeedsUnscopedDocs(r3, "fixed-asset-doc-lists-transfer"));
        assertFalse(GenericService.approverNeedsUnscopedDocs(r3, "fixed-assets"));
        assertFalse(GenericService.approverNeedsUnscopedDocs(r3, "low-value-requisition"));
        assertFalse(GenericService.approverNeedsUnscopedDocs(principal("DEPT_ONLY", "fa:view"), "fixed-asset-doc-lists-transfer"));
        assertFalse(GenericService.approverNeedsUnscopedDocs(principal("COMPANY", "wm:todo"), "fixed-asset-doc-lists-transfer"));
        assertFalse(GenericService.approverNeedsUnscopedDocs(null, "fixed-asset-doc-lists-transfer"));
    }
}
