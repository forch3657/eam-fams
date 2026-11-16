package com.fams.p14;

import com.fams.common.ApiException;
import com.fams.contract.ResourceMeta;
import com.fams.contract.ResourceRegistry;
import com.fams.engine.RowScopeGuard;
import com.fams.security.CompanyScopeResolver;
import com.fams.security.UserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * D1 门禁 1 证据：统一行级断言的规则单测。
 *
 * <p>不启动 Spring 容器，直接构造 {@link RowScopeGuard} 并设置登录上下文，
 * 覆盖公司层级展开、按 id 越权读取、写入归属伪造与回填、清空限制、
 * 审批人待办例外仍按公司过滤、组织主数据写入后的缓存失效。</p>
 */
class GroupScopeGuardTest {

    private CompanyScopeResolver companies;

    private ResourceRegistry registry;

    private ResourceMeta assets;

    private ResourceMeta docs;

    private RowScopeGuard guard;

    @BeforeEach
    void setUp() {
        companies = Mockito.mock(CompanyScopeResolver.class);
        registry = Mockito.mock(ResourceRegistry.class);
        assets = Mockito.mock(ResourceMeta.class);
        docs = Mockito.mock(ResourceMeta.class);
        Mockito.when(assets.getAllColumns()).thenReturn(Arrays.asList(
                "id", "companyId", "deptId", "userId", "creatorId", "createBy"));
        Mockito.when(docs.getAllColumns()).thenReturn(Arrays.asList(
                "id", "companyId", "creatorId", "createBy"));
        Mockito.when(registry.resolve("fixed-assets")).thenReturn(assets);
        Mockito.when(registry.resolve("fixed-asset-doc-lists-borrow")).thenReturn(docs);
        Mockito.when(registry.resolve("org-companies")).thenReturn(assets);
        guard = new RowScopeGuard(companies, registry);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("COMPANY 范围按公司树下钻，且覆盖客户端伪造的 companyId 参数")
    void companyScopeExpandsToChildren() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any()))
                .thenReturn(ids("C1", "C2"));
        Map<String, String[]> raw = new HashMap<>();
        raw.put("companyId", new String[]{"C3"});

        Map<String, String[]> scoped = guard.scopeRaw("fixed-assets", assets, raw);

        assertThat(scoped.get("companyId")).containsExactly("C1", "C2");
    }

    @Test
    @DisplayName("按 id 读取其他公司数据被拒绝（S-04 负向）")
    void readOtherCompanyRejected() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1", "C2"));
        Map<String, Object> row = new HashMap<>();
        row.put("companyId", "C3");

        assertThatThrownBy(() -> guard.assertRead("fixed-assets", row))
                .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("读取本公司及下级公司数据放行")
    void readVisibleCompanyAllowed() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1", "C2"));
        Map<String, Object> row = new HashMap<>();
        row.put("companyId", "C2");

        assertThatCode(() -> guard.assertRead("fixed-assets", row)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("新增未填归属时按主体公司回填，不再挂到列表第一家或集团")
    void writeFillsCompanyWhenMissing() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1", "C2"));
        Map<String, Object> payload = new HashMap<>();

        guard.assertWrite("fixed-assets", payload, null);

        assertThat(payload.get("companyId")).isEqualTo("C1");
    }

    @Test
    @DisplayName("更新全量替换把归属清空时回填旧归属")
    void writeKeepsPreviousCompany() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1", "C2"));
        Map<String, Object> previous = new HashMap<>();
        previous.put("companyId", "C2");
        Map<String, Object> payload = new HashMap<>();

        guard.assertWrite("fixed-assets", payload, previous);

        assertThat(payload.get("companyId")).isEqualTo("C2");
    }

    @Test
    @DisplayName("把数据伪造/改挂到其他公司被拒绝")
    void writeOtherCompanyRejected() {
        login("COMPANY", "C1");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1", "C2"));
        Map<String, Object> payload = new HashMap<>();
        payload.put("companyId", "C3");

        assertThatThrownBy(() -> guard.assertWrite("fixed-assets", payload, null))
                .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("清空集合：非全集团范围拒绝，ALL 放行（S-05）")
    void clearLimitedToAllScope() {
        login("COMPANY", "C1");
        assertThatThrownBy(() -> guard.assertClear("fixed-assets"))
                .isInstanceOf(ApiException.class);

        login("ALL", "C1");
        assertThatCode(() -> guard.assertClear("fixed-assets")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("ALL 范围不注入过滤，保持既有管理员行为")
    void allScopeBypassesFiltering() {
        login("ALL", "C1");
        Map<String, String[]> raw = new HashMap<>();
        raw.put("status", new String[]{"IN_USE"});

        assertThat(guard.scopeRaw("fixed-assets", assets, raw)).isSameAs(raw);
        Mockito.verifyNoInteractions(companies);
    }

    @Test
    @DisplayName("审批人待办例外只放开经办人维度，公司维度仍然生效")
    void approverExceptionStillFiltersCompany() {
        login("DEPT_ONLY", "C1", "wm:todo");
        Mockito.when(companies.visibleCompanyIds(Mockito.any())).thenReturn(ids("C1"));

        Map<String, String[]> scoped = guard.scopeRaw(
                "fixed-asset-doc-lists-borrow", docs, new HashMap<>());

        assertThat(scoped.get("companyId")).containsExactly("C1");
        assertThat(scoped.get("creatorId")).isNull();
    }

    @Test
    @DisplayName("公司/部门主数据写入后失效可见范围缓存")
    void orgWriteInvalidatesCache() {
        login("ALL", "C1");
        guard.assertWrite("org-companies", new HashMap<>(), null);
        Mockito.verify(companies).invalidate();
    }

    private void login(String dataScope, String companyId, String... permissions) {
        Map<String, Object> user = new HashMap<>();
        user.put("id", "U1");
        user.put("username", "tester");
        user.put("companyId", companyId);
        user.put("deptId", "D1");
        Set<String> perms = new LinkedHashSet<>(Arrays.asList(permissions));
        UserPrincipal principal = new UserPrincipal(user, perms, dataScope, "COMPANY", Collections.emptySet());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private static Set<String> ids(String... values) {
        return new LinkedHashSet<>(Arrays.asList(values));
    }
}
