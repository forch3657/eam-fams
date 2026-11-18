package com.fams.p17;

import com.fams.engine.GenericService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P17 用户编号与登录名可编辑：
 * - userNo 留空时服务端按全表最大序号自动生成，唯一；
 * - userNo / username 均可改，重复返回 409；
 * - 编辑时未带 userNo 不得清空原值。
 *
 * <p>编号/用户名均带随机后缀，避免与演示数据或其它测试残留冲突（H2 库在复用 fork 内共享）。</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class P17UserNoTest {

    @Autowired GenericService genericService;

    private static final String SUF = String.valueOf(System.nanoTime() % 100000);
    private static final java.util.Random RAND = new java.util.Random(System.nanoTime());
    private static String uniqueNo() {
        // 6 位随机编号，避开演示数据(YH-0001..)和上次运行残留(YH-9xxx)
        return "YH-" + (100000 + RAND.nextInt(899999));
    }

    private Map<String, Object> user(String name, String userNo) {
        Map<String, Object> m = new HashMap<>();
        m.put("username", "p17_" + name + "_" + SUF);
        m.put("name", "编号测试用户");
        m.put("password", "Test@2026!");
        m.put("companyId", "C1");
        m.put("roleIds", java.util.Collections.singletonList("R3"));
        m.put("status", "ENABLED");
        if (userNo != null) m.put("userNo", userNo);
        return m;
    }

    @Test
    @DisplayName("新增用户不填 userNo 时自动生成 YH-#### 且全局唯一")
    void autoGenerateUserNo() {
        Map<String, Object> a = genericService.create("org-users", user("auto_a", null));
        Map<String, Object> b = genericService.create("org-users", user("auto_b", null));
        String noA = String.valueOf(a.get("userNo"));
        String noB = String.valueOf(b.get("userNo"));
        // 序号按全表最大值 +1，测试残留的 6 位随机号会推高位数，故只校验 YH- 前缀 + 数字
        assertThat(noA).matches("YH-\\d+");
        assertThat(noB).matches("YH-\\d+");
        assertThat(noA).isNotEqualTo(noB);
    }

    @Test
    @DisplayName("指定 userNo 被保留；重复 userNo 返回 409")
    void keepAndRejectDuplicateUserNo() {
        String no = uniqueNo();
        Map<String, Object> created = genericService.create("org-users", user("fixed", no));
        assertThat(created.get("userNo")).isEqualTo(no);

        assertThatThrownBy(() -> genericService.create("org-users", user("dup", no)))
                .isInstanceOf(com.fams.common.ApiException.class);
    }

    @Test
    @DisplayName("编辑用户不带 userNo 时保留原编号，不被清空")
    void editKeepsUserNo() {
        String no = uniqueNo();
        Map<String, Object> created = genericService.create("org-users", user("keep", no));
        String id = String.valueOf(created.get("id"));
        String username = String.valueOf(created.get("username"));

        Map<String, Object> patch = new HashMap<>();
        patch.put("username", username);
        patch.put("name", "改名不换号");
        patch.put("companyId", "C1");
        patch.put("roleIds", java.util.Collections.singletonList("R3"));
        patch.put("status", "ENABLED");
        // 不带 userNo，模拟前端漏传
        Map<String, Object> updated = genericService.update("org-users", id, patch);
        assertThat(updated.get("userNo")).isEqualTo(no);
    }

    @Test
    @DisplayName("用户名可修改：改后按新名可查，旧名查不到；新名重复返回 409")
    void usernameEditable() {
        String no = uniqueNo();
        Map<String, Object> created = genericService.create("org-users", user("old", no));
        String id = String.valueOf(created.get("id"));
        String oldUsername = String.valueOf(created.get("username"));
        String newUsername = "p17_new_" + SUF;

        Map<String, Object> patch = user("new_marker", no);
        patch.put("username", newUsername);
        patch.put("name", "改名测试");
        genericService.update("org-users", id, patch);

        assertThat(genericService.findByUsername(newUsername)).isNotNull();
        assertThat(genericService.findByUsername(oldUsername)).isNull();

        String otherNo = uniqueNo();
        Map<String, Object> other = genericService.create("org-users", user("other", otherNo));
        Map<String, Object> dup = new HashMap<>(user("dup_marker", otherNo));
        dup.put("username", newUsername);
        assertThatThrownBy(() -> genericService.update("org-users", String.valueOf(other.get("id")), dup))
                .isInstanceOf(com.fams.common.ApiException.class);
    }
}
