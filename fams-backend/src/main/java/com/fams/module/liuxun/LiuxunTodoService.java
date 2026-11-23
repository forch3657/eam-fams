package com.fams.module.liuxun;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 待办同步服务（单向：本地审批动作 → 柳讯待办）。
 *
 * <p>业务口径：柳讯待办只做提醒入口，审批动作必须在本地系统完成；
 * 因此只提供创建/更新/完成/删除，不做柳讯完成后的反向状态同步。
 * mock=true 时只落日志并返回假 todoId，不出站请求。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LiuxunTodoService {

    private final LiuxunProperties properties;
    private final LiuxunOAuth2Client oauth2Client;
    private final ObjectMapper objectMapper;

    private long mockTodoSeq = 1000L;

    /** 创建待办，返回柳讯待办 ID */
    public long create(LiuxunTodoRequest request) {
        if (properties.isMock()) {
            long id = ++mockTodoSeq;
            log.info("[liuxun:mock] 创建待办 id={} name={} bizId={} userIds={}",
                    id, request.getName(), request.getBizId(), request.getUserIds());
            return id;
        }
        JsonNode result = call(HttpMethod.POST, "/api/todo", toBody(request));
        return result.path("result").asLong(0L);
    }

    /** 更新待办（名称/内容/时间/关联人/通知） */
    public void update(long todoId, LiuxunTodoRequest request) {
        if (properties.isMock()) {
            log.info("[liuxun:mock] 更新待办 id={} name={} userIds={}", todoId, request.getName(), request.getUserIds());
            return;
        }
        call(HttpMethod.PUT, "/api/todo/" + todoId, toBody(request));
    }

    /** 完成待办 */
    public void complete(long todoId, long liuxunUserId) {
        if (properties.isMock()) {
            log.info("[liuxun:mock] 完成待办 todoId={} userId={}", todoId, liuxunUserId);
            return;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("todoId", todoId);
        body.put("userId", liuxunUserId);
        call(HttpMethod.PUT, "/api/todo/complete", body);
    }

    /** 删除待办（撤销时用） */
    public void delete(long todoId) {
        if (properties.isMock()) {
            log.info("[liuxun:mock] 删除待办 id={}", todoId);
            return;
        }
        RestTemplate template = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(oauth2Client.clientToken().getAccessToken());
        try {
            template.exchange(properties.getBaseUrl() + "/api/todo/" + todoId,
                    HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯删除待办失败: " + e.getMessage(), e);
        }
    }

    /** 检索待办 ID（对账用；status: 0-待办 1-完成） */
    public List<Long> queryIds(String bizId, Integer status) {
        if (properties.isMock()) {
            log.info("[liuxun:mock] 检索待办 bizId={} status={}", bizId, status);
            return new ArrayList<>();
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("appId", properties.getAppId());
        if (bizId != null && !bizId.isEmpty()) body.put("bizId", bizId);
        if (status != null) body.put("status", status);
        JsonNode result = call(HttpMethod.POST, "/api/todo/query/ids", body);
        List<Long> ids = new ArrayList<>();
        if (result.isArray()) {
            result.forEach(node -> ids.add(node.asLong()));
        }
        return ids;
    }

    private JsonNode call(HttpMethod method, String path, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(oauth2Client.clientToken().getAccessToken());
        RestTemplate template = new RestTemplate();
        try {
            ResponseEntity<String> response = template.exchange(
                    properties.getBaseUrl() + path, method,
                    new HttpEntity<>(body, headers), String.class);
            JsonNode root = objectMapper.readTree(response.getBody());
            if (root.path("code").asInt(-1) != 0) {
                throw new IllegalStateException("柳讯待办接口失败 path=" + path + " body=" + response.getBody());
            }
            return root.path("result");
        } catch (RestClientException e) {
            throw new IllegalStateException("柳讯待办接口网络失败 path=" + path + ": " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("柳讯待办响应解析失败 path=" + path + ": " + e.getMessage(), e);
        }
    }

    private Map<String, Object> toBody(LiuxunTodoRequest r) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("appId", r.getAppId() == null || r.getAppId().isEmpty() ? properties.getAppId() : r.getAppId());
        body.put("name", r.getName());
        body.put("content", r.getContent());
        body.put("type", r.getType() == null ? 1 : r.getType());
        body.put("bizId", r.getBizId());
        body.put("bizUrl", r.getBizUrl());
        body.put("userIds", r.getUserIds() == null ? new ArrayList<>() : r.getUserIds());
        body.put("createUserId", r.getCreateUserId());
        body.put("needPushNoticeMsg", r.getNeedPushNoticeMsg() == null ? 0 : r.getNeedPushNoticeMsg());
        if (r.getStartTime() != null) body.put("startTime", r.getStartTime());
        if (r.getEndTime() != null) body.put("endTime", r.getEndTime());
        if (r.getNoticeMsgContent() != null) body.put("noticeMsgContent", r.getNoticeMsgContent());
        return body;
    }
}
