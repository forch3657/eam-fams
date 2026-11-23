package com.fams.module.liuxun;

import lombok.Data;

import java.util.List;
import java.util.Map;

/** 待办请求 DTO（字段对应柳讯 /api/todo 文档，仅本系统用到的部分） */
@Data
public class LiuxunTodoRequest {

    /** 待办名称（必填） */
    private String name;

    /** 待办内容 */
    private String content;

    /** 待办类型：1-第三方应用 */
    private Integer type = 1;

    /** 应用 ID；留空时用配置默认值 */
    private String appId;

    /** 业务 ID：本地单据 ID，用于关联与对账 */
    private String bizId;

    /** 业务链接：指向本系统免登入口 */
    private String bizUrl;

    /** 待办关联人员：柳讯用户 ID 列表 */
    private List<Long> userIds;

    /** 创建人：柳讯用户 ID */
    private Long createUserId;

    /** 是否推送消息通知：0-否 1-是 */
    private Integer needPushNoticeMsg = 0;

    private String startTime;

    private String endTime;

    private Map<String, Object> noticeMsgContent;
}
