package com.fams.p12;

import com.fams.engine.PermissionPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P12 权限契约（{@code contract/permission-resources.json}）的加载与匹配规则。
 *
 * <p>这份契约是前后端共用的单一事实来源：E2E 的
 * {@code tests/e2e/fixtures/permissionMatrix.ts} 与本测试断言同一套映射，
 * 任一侧单独改动都会被对方判红，避免再次出现「前端按钮可见、后端 403」。</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class P12PermissionContractTest {

    @Autowired
    private PermissionPolicy policy;

    @Test
    @DisplayName("契约文件启动时加载成功，而不是退回内置默认映射")
    void contractLoadedFromClasspath() {
        assertThat(policy.isContractLoaded()).isTrue();
    }

    @Test
    @DisplayName("低值单据按模块码放行：只有 lv:requisition 的部门主管也能建领用")
    void lowValueDocsUseModuleCodes() {
        Set<String> leader = new HashSet<>(Arrays.asList("lv:view", "lv:requisition"));
        assertThat(policy.matches("low-value-requisition", "POST", leader)).isTrue();
        assertThat(policy.matches("low-value-inbound", "POST", leader)).isFalse();
        assertThat(policy.matches("low-value-return", "POST", leader)).isFalse();
        // 读统一随 lv:view，业务表单的下拉不能因为写码不同而变空
        assertThat(policy.matches("low-value-requisition", "GET", leader)).isTrue();
    }

    @Test
    @DisplayName("精确 key 优先于前缀：折旧方案读随 fa:view，写要 fa:depreciation")
    void exactKeyBeatsPrefix() {
        Set<String> viewer = new HashSet<>(Collections.singletonList("fa:view"));
        assertThat(policy.matches("fixed-asset-depreciation-schemes", "GET", viewer)).isTrue();
        assertThat(policy.matches("fixed-asset-depreciation-schemes", "POST", viewer)).isFalse();
        assertThat(policy.matches("fixed-asset-settings-depreciation-plans", "GET", viewer)).isTrue();
        assertThat(policy.matches("fixed-asset-settings-depreciation-plans", "POST", viewer)).isFalse();
    }

    @Test
    @DisplayName("最长前缀生效：存放位置读随 lv:view、写要 lv:settings")
    void longestPrefixWins() {
        Set<String> viewer = new HashSet<>(Collections.singletonList("lv:view"));
        assertThat(policy.matches("low-value-settings-locations", "GET", viewer)).isTrue();
        assertThat(policy.matches("low-value-settings-locations", "POST", viewer)).isFalse();

        Set<String> configAdmin = new HashSet<>(Collections.singletonList("lv:settings"));
        assertThat(policy.matches("low-value-settings-locations", "POST", configAdmin)).isTrue();
    }

    @Test
    @DisplayName("未登记读码的集合仅需登录，写仍要权限码")
    void unregisteredReadOnlyRequiresLogin() {
        Set<String> anonymous = Collections.emptySet();
        assertThat(policy.matches("org-companies", "GET", anonymous)).isTrue();
        assertThat(policy.matches("org-departments", "GET", anonymous)).isTrue();
        assertThat(policy.matches("org-roles", "GET", anonymous)).isTrue();
        assertThat(policy.matches("org-companies", "POST", anonymous)).isFalse();
        assertThat(policy.matches("org-roles", "DELETE", anonymous)).isFalse();
    }

    @Test
    @DisplayName("审批留痕可读不可写，任何角色都不能绕过")
    void approvalTrailIsImmutable() {
        Set<String> superAdmin = new HashSet<>(Arrays.asList(
                "fa:view", "fa:add", "fa:edit", "fa:delete", "org:role", "sys:log"));
        assertThat(policy.matches("fixed-asset-doc-approvals", "GET", Collections.emptySet())).isTrue();
        assertThat(policy.matches("fixed-asset-doc-approvals", "POST", superAdmin)).isFalse();
        assertThat(policy.matches("fixed-asset-doc-approvals", "DELETE", superAdmin)).isFalse();
    }

    @Test
    @DisplayName("工作台待办角色可读用户与流程配置（否则待办人恒为空）")
    void workbenchTodoCanReadApprovalInputs() {
        Set<String> leader = new HashSet<>(Arrays.asList("wm:view", "wm:todo"));
        assertThat(policy.matches("org-users", "GET", leader)).isTrue();
        assertThat(policy.matches("system-workflow-flows", "GET", leader)).isTrue();
        assertThat(policy.matches("system-params", "GET", leader)).isTrue();

        Set<String> viewer = new HashSet<>(Collections.singletonList("wm:view"));
        assertThat(policy.matches("org-users", "GET", viewer)).isFalse();
    }
}
