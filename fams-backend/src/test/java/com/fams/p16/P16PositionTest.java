package com.fams.p16;

import com.fams.engine.GenericService;
import com.fams.security.JwtProvider;
import com.fams.security.UserDetailsServiceImpl;
import com.fams.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P16 一人多岗验收：岗位建模 + 当前岗位上下文（JWT claim）+ 按单据公司的审批角色池。
 *
 * <p>所有造数使用独立前缀（p16_），避免与演示和其它测试账号冲突；测试库为内存 H2，
 * 每个测试类上下文隔离，无需清理。</p>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class P16PositionTest {

    private static final String USERNAME = "p16_multi_position";
    private static final String PASSWORD = "Pos@2026pass";
    private static final String USER_ID = "p16-u-1";
    private static final String PRIMARY_POS = "p16-pos-primary";
    private static final String SECOND_POS = "p16-pos-second";

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired GenericService genericService;
    @Autowired JwtProvider jwtProvider;
    @Autowired UserDetailsServiceImpl userDetailsService;

    @BeforeEach
    void seed() {
        if (genericService.findByUsername(USERNAME) == null) {
            Map<String, Object> user = new HashMap<>();
            user.put("id", USER_ID);
            user.put("username", USERNAME);
            user.put("name", "兼职测试用户");
            user.put("password", new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(PASSWORD));
            user.put("companyId", "C1");
            user.put("deptId", "D1");
            user.put("roleIds", java.util.Collections.singletonList("R5"));
            user.put("status", "ENABLED");
            genericService.create("org-users", user);
        }
        boolean hasPrimary = false;
        boolean hasSecond = false;
        for (Map<String, Object> p : genericService.positionsOfUser(USER_ID)) {
            if (PRIMARY_POS.equals(String.valueOf(p.get("id")))) hasPrimary = true;
            if (SECOND_POS.equals(String.valueOf(p.get("id")))) hasSecond = true;
        }
        if (!hasPrimary) {
            genericService.create("org-user-positions", position(PRIMARY_POS, "C1", "D1", "主职岗", java.util.Collections.singletonList("R5"), true));
        }
        if (!hasSecond) {
            genericService.create("org-user-positions", position(SECOND_POS, "C2", "D8", "兼职岗", java.util.Collections.singletonList("R4"), false));
        }
    }

    private static Map<String, Object> position(String id, String company, String dept,
                                                String name, List<String> roles, boolean primary) {
        Map<String, Object> p = new HashMap<>();
        p.put("id", id);
        p.put("userId", USER_ID);
        p.put("companyId", company);
        p.put("deptId", dept);
        p.put("position", name);
        p.put("roleIds", roles);
        p.put("isPrimary", primary);
        p.put("status", "ENABLED");
        p.put("sort", primary ? 1 : 2);
        return p;
    }

    @Test
    @DisplayName("JWT 携带岗位 claim；无岗位时按主职（空 claim）")
    void jwtCarriesPosition() {
        String token = jwtProvider.generate(USERNAME, SECOND_POS);
        assertThat(jwtProvider.validate(token)).isTrue();
        assertThat(jwtProvider.parse(token)).isEqualTo(USERNAME);
        assertThat(jwtProvider.parsePositionId(token)).isEqualTo(SECOND_POS);
        String primaryToken = jwtProvider.generate(USERNAME);
        assertThat(jwtProvider.parsePositionId(primaryToken)).isEmpty();
    }

    @Test
    @DisplayName("按岗位构建主体：companyId/deptId/roleIds 被当前岗位覆盖")
    void principalUsesCurrentPosition() {
        UserDetails byPrimary = userDetailsService.loadUserByUsername(USERNAME, PRIMARY_POS);
        assertThat(byPrimary).isInstanceOf(UserPrincipal.class);
        UserPrincipal primary = (UserPrincipal) byPrimary;
        assertThat(primary.getCompanyId()).isEqualTo("C1");
        assertThat(primary.getDeptId()).isEqualTo("D1");
        assertThat(primary.getRoleIds()).containsExactly("R5");
        assertThat(primary.getPositionId()).isEqualTo(PRIMARY_POS);
        // 领导班子权限：R4 财务角色含 sys:log
        assertThat(primary.getAuthorities()).extracting("authority").contains("fa:view");

        UserPrincipal second = (UserPrincipal) userDetailsService.loadUserByUsername(USERNAME, SECOND_POS);
        assertThat(second.getCompanyId()).isEqualTo("C2");
        assertThat(second.getDeptId()).isEqualTo("D8");
        assertThat(second.getRoleIds()).containsExactly("R4");
        assertThat(second.getAuthorities()).extracting("authority").contains("sys:log");
    }

    @Test
    @DisplayName("无效/越权岗位回落主职，防伪造提权")
    void invalidPositionFallsBackToPrimary() {
        UserPrincipal fake = (UserPrincipal) userDetailsService.loadUserByUsername(USERNAME, "not-mine");
        assertThat(fake.getPositionId()).isEmpty();
        assertThat(fake.getCompanyId()).isEqualTo("C1");
        assertThat(fake.getRoleIds()).containsExactly("R5");
    }

    @Test
    @DisplayName("岗位查询：activePositionOf 校验归属；positionsOfUser 列全部启用岗位")
    void positionQueries() {
        assertThat(genericService.activePositionOf(USER_ID, SECOND_POS)).isNotNull();
        assertThat(genericService.activePositionOf("another-user", SECOND_POS)).isNull();
        assertThat(genericService.activePositionOf(USER_ID, "missing")).isNull();
        List<Map<String, Object>> all = genericService.positionsOfUser(USER_ID);
        assertThat(all).extracting("id").contains(PRIMARY_POS, SECOND_POS);
        assertThat(genericService.nameOf("org-companies", "C2")).isNotBlank();
    }

    @Test
    @DisplayName("userHasRole 纳入岗位角色（主职无财务角色，但兼职岗位有 R4）")
    void userHasRoleFromPosition() {
        // 先把主表角色改成不含 R4，验证只能从岗位命中
        Map<String, Object> user = genericService.get("org-users", USER_ID);
        user.put("roleIds", java.util.Collections.singletonList("R5"));
        genericService.updateQuietly("org-users", USER_ID, user);
        assertThat(genericService.userHasRole(USER_ID, "R4")).isTrue();
        assertThat(genericService.userHasRole(USER_ID, "ROLE_NOT_EXIST")).isFalse();
    }

    @Test
    @DisplayName("审批角色池按单据公司纳入兼职岗位角色（C2 的 R4 财务审批人含本用户）")
    void rolePoolIncludesPartTimePosition() {
        List<String> ids = genericService.userIdsOfRole("R4", "C2");
        assertThat(ids).contains(USER_ID);
    }

    @Test
    @DisplayName("切换岗位：重签 token + 旧 token 拉黑；越权岗位被拒")
    void switchPosition() throws Exception {
        String login = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(USERNAME, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.currentPositionId").value(PRIMARY_POS))
                .andReturn().getResponse().getContentAsString();
        String oldToken = objectMapper.readTree(login).path("data").path("token").asText();

        String switched = mockMvc.perform(post("/api/auth/switch-position")
                        .header("Authorization", "Bearer " + oldToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"positionId\":\"" + SECOND_POS + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.currentPositionId").value(SECOND_POS))
                .andExpect(jsonPath("$.data.user.companyId").value("C2"))
                .andReturn().getResponse().getContentAsString();
        String newToken = objectMapper.readTree(switched).path("data").path("token").asText();
        assertThat(jwtProvider.parsePositionId(newToken)).isEqualTo(SECOND_POS);

        // 旧 token 已被拉黑
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/profile")
                        .header("Authorization", "Bearer " + oldToken))
                .andExpect(status().isUnauthorized());

        // 越岗位：用新 token 切到不属于自己的岗位被拒
        mockMvc.perform(post("/api/auth/switch-position")
                        .header("Authorization", "Bearer " + newToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"positionId\":\"not-mine\"}"))
                .andExpect(status().isForbidden());
    }

    private String credentials(String username, String password) throws Exception {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("username", username);
        map.put("password", password);
        return objectMapper.writeValueAsString(map);
    }
}
