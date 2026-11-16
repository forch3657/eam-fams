package com.fams.p14;

import com.fams.engine.RowScopeGuard;
import com.fams.security.CompanyScopeResolver;
import com.fams.contract.ResourceRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D2 门禁 2 证据：公司视角与审批角色池的纯逻辑单测（不启动 Spring 容器）。
 */
class D2CompanyViewTest {

    private CompanyScopeResolver companies;
    private RowScopeGuard guard;

    @BeforeEach
    void setUp() {
        companies = Mockito.mock(CompanyScopeResolver.class);
        ResourceRegistry registry = Mockito.mock(ResourceRegistry.class);
        guard = new RowScopeGuard(companies, registry);

        // 集团 → 研究院 → 至臻/新视/数源；候选用户 A 公司仓管仅可见本公司
        Set<String> aVisible = new LinkedHashSet<>(Arrays.asList("G", "A"));
        Mockito.when(companies.visibleCompanyIdsFor(Mockito.eq("A"), Mockito.anyCollection()))
                .thenReturn(aVisible);
        Set<String> allVisible = new LinkedHashSet<>(Arrays.asList("G", "A", "B", "C"));
        Mockito.when(companies.visibleCompanyIdsFor(Mockito.eq("G"), Mockito.anyCollection()))
                .thenReturn(allVisible);
    }

    @Test
    @DisplayName("角色池按单据公司过滤：A 公司用户看不到 B 公司单据")
    void approverPoolScopedByDocCompany() {
        Map<String, Object> aWarehouse = user("A", "COMPANY");
        // A 公司仓管只能审批归属 G/A 的单据，不能审批 B 公司单据
        assertThat(guard.isUserCompanyEligible(aWarehouse, "A", "COMPANY")).isTrue();
        assertThat(guard.isUserCompanyEligible(aWarehouse, "B", "COMPANY")).isFalse();
        assertThat(guard.isUserCompanyEligible(aWarehouse, "G", "COMPANY")).isTrue();
    }

    @Test
    @DisplayName("全集团账号(dataScope=ALL)在任何公司单据上都放行")
    void allScopeEligibleEverywhere() {
        Map<String, Object> admin = user("G", "ALL");
        assertThat(guard.isUserCompanyEligible(admin, "B", "ALL")).isTrue();
        assertThat(guard.isUserCompanyEligible(admin, "C", "ALL")).isTrue();
    }

    @Test
    @DisplayName("显式授权公司纳入可见集合（兼任场景）")
    void explicitScopeCompanyIncluded() {
        Map<String, Object> cross = user("A", "COMPANY");
        cross.put("scopeCompanyIds", Arrays.asList("B"));
        Mockito.when(companies.visibleCompanyIdsFor(Mockito.eq("A"), Mockito.anyCollection()))
                .thenReturn(new LinkedHashSet<>(Arrays.asList("A", "B")));
        assertThat(guard.isUserCompanyEligible(cross, "B", "COMPANY")).isTrue();
    }

    @Test
    @DisplayName("JSON 字符串形式的授权公司也能解析")
    void jsonScopeCompanyParsed() {
        Map<String, Object> cross = user("A", "COMPANY");
        cross.put("scopeCompanyIds", "[\"B\",\"C\"]");
        Mockito.when(companies.visibleCompanyIdsFor(Mockito.eq("A"), Mockito.anyCollection()))
                .thenReturn(new LinkedHashSet<>(Arrays.asList("A", "B", "C")));
        assertThat(guard.isUserCompanyEligible(cross, "C", "COMPANY")).isTrue();
    }

    private static Map<String, Object> user(String companyId, String dataScope) {
        Map<String, Object> u = new HashMap<>();
        u.put("companyId", companyId);
        u.put("dataScope", dataScope);
        return u;
    }
}
