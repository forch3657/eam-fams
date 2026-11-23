package com.fams.module.liuxun;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 柳讯开放能力平台配置（fams.liuxun.*）。
 *
 * <p>地址一律走配置，不写死在代码里：本机调试、正式测试环境、公网映射
 * 只改 profile 配置即可迁移。mock=true 时所有出站 HTTP 被本地桩替代，
 * 用假数据跑通前端路由、用户映射与待办数据结构，等柳讯侧配置就绪后
 * 改 false 并填真实地址即可联调。</p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "fams.liuxun")
public class LiuxunProperties {

    /** true=本地桩模式（不访问柳讯），false=真实 HTTP 调用 */
    private boolean mock = true;

    /** 柳讯开放能力平台根地址，如 http://172.19.19.16:31460 */
    private String baseUrl = "";

    /** 测试账号 clientId */
    private String clientId = "";

    /** 测试账号 clientSecret（生产必须由环境变量注入） */
    private String clientSecret = "";

    /** 应用 ID，创建待办时必填 */
    private String appId = "";

    /** 授权回调地址，必须与柳讯侧注册值逐字一致 */
    private String redirectUri = "";

    /** HTTP 连接超时（毫秒） */
    private int connectTimeout = 5000;

    /** HTTP 读取超时（毫秒） */
    private int readTimeout = 10000;

    /** mock 模式返回的测试账号（手机号），同时也是本地 username */
    private String mockUserPhone = "13625070487";

    /** mock 模式返回的柳讯用户 ID */
    private long mockUserId = 157L;

    /** mock 模式返回的姓名 */
    private String mockUserName = "测试用户";

    /** 自动建号：默认角色编码（按 org-roles.code 解析），待业务确认 */
    private String defaultRoleCode = "ROLE_USER";

    /** 自动建号：默认岗位名称（org-user-positions.position 自由文本），待业务确认 */
    private String defaultPosition = "职员";

    /** 自动建号：默认归属公司 ID，待业务确认 */
    private String defaultCompanyId = "C1";

    /** 自动建号：默认归属部门 ID，待业务确认 */
    private String defaultDeptId = "D1";
}
