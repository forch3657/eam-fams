package com.fams;

/**
 * 自动化测试使用的演示账号与初始口令（唯一来源）。
 *
 * <p>口令必须与 {@code db/seed.sql} 中 {@code org_users} 的<b>明文初始口令</b>保持一致：
 * 种子入库后由 {@code DataInitializer} 统一迁移为 BCrypt 再做校验。</p>
 *
 * <p>历史教训：口令原先硬编码在 8 个测试类里，第 1 阶段把种子改为强初始口令后，
 * 这些类全部因登录失败而变红，却因为构建长期用 {@code -DskipTests} 而没被发现。
 * 因此口令只允许在这里定义一处，各测试类一律引用本类。</p>
 */
public final class TestAccounts {

    /** 演示管理员账号（seed U1） */
    public static final String ADMIN = "admin";

    /** 种子里的初始口令（明文；入库后由 DataInitializer 迁移为 BCrypt） */
    public static final String PASSWORD = "Fzidt@123";

    private TestAccounts() {
    }
}
