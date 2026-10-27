package com.fams.security;

import com.fams.engine.GenericService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 内置管理员初始化：账号不存在时按配置密码创建（密码用 BCrypt 落库）。
 *
 * <p>生产环境不配置 {@code fams.security.bootstrap-password} 即不创建任何内置账号，
 * 避免默认口令进入生产库。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private static final String ORG_USERS = "org-users";

    private static final String ID_FIELD = "id";

    private static final String PASSWORD_FIELD = "password";

    /** BCrypt 密文形态：$2a$ / $2b$ / $2y$ 开头 */
    private static final Pattern BCRYPT = Pattern.compile("^\\$2[aby]\\$\\d{2}\\$.{53}$");

    private final GenericService genericService;

    private final PasswordEncoder passwordEncoder;

    @Value("${fams.security.bootstrap-username:admin}")
    private String bootstrapUsername;

    @Value("${fams.security.bootstrap-name:系统管理员}")
    private String bootstrapName;

    /** 为空表示不创建内置账号 */
    @Value("${fams.security.bootstrap-password:}")
    private String bootstrapPassword;

    @Override
    public void run(ApplicationArguments args) {
        migratePlainPasswords();
        ensureAdmin();
    }

    /**
     * 明文口令迁移：演示数据来自前端 mock（密码为明文），入库前统一换成 BCrypt。
     *
     * <p>只处理非 bcrypt 形态的值；迁移完成后各账号的原口令保持不变，
     * 因此演示登录（账号口令见 {@code db/seed.sql}，统一为 {@code Fzidt@123}）仍然可用。</p>
     */
    private void migratePlainPasswords() {
        // 必须用 listInternal：list() 已对 org-users 做口令脱敏，取不到原始 password 列
        List<Map<String, Object>> users = genericService.listInternal(ORG_USERS, Collections.emptyMap());
        int migrated = 0;
        for (Map<String, Object> user : users) {
            Object id = user.get(ID_FIELD);
            String stored = user.get(PASSWORD_FIELD) == null ? "" : String.valueOf(user.get(PASSWORD_FIELD));
            if (id == null || stored.isEmpty() || BCRYPT.matcher(stored).matches()) {
                continue;
            }
            genericService.patchField(ORG_USERS, String.valueOf(id), PASSWORD_FIELD, passwordEncoder.encode(stored));
            migrated++;
        }
        if (migrated > 0) {
            log.info("已将 {} 个演示账号的明文口令迁移为 BCrypt", migrated);
        }
    }

    private void ensureAdmin() {
        if (bootstrapPassword == null || bootstrapPassword.trim().isEmpty()) {
            log.info("未配置 bootstrap-password，跳过内置管理员初始化");
            return;
        }
        if (genericService.findByUsername(bootstrapUsername) != null) {
            return;
        }
        Map<String, Object> admin = new HashMap<>();
        admin.put(ID_FIELD, "u-admin");
        admin.put("username", bootstrapUsername);
        admin.put("name", bootstrapName);
        admin.put(PASSWORD_FIELD, passwordEncoder.encode(bootstrapPassword));
        admin.put("companyId", "C1");
        admin.put("deptId", "D1");
        admin.put("status", "ENABLED");
        try {
            genericService.create(ORG_USERS, admin);
            log.info("已初始化内置管理员账号：{}（请登录后立即修改密码）", bootstrapUsername);
        } catch (RuntimeException ex) {
            // 演示库缺少公司/部门基线时不阻断启动，仅提示
            log.warn("内置管理员账号初始化失败：{}", ex.getMessage());
        }
    }
}
