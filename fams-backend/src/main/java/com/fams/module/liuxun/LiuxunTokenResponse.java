package com.fams.module.liuxun;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.Map;

/**
 * POST /oauth/token 响应。
 *
 * <p>用 JsonIgnoreProperties 容忍柳讯后续增加字段（实测已比文档多 jti）；
 * account_info 只在授权码模式返回，客户端模式为 null。</p>
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class LiuxunTokenResponse {

    @JsonProperty("access_token")
    private String accessToken;

    @JsonProperty("token_type")
    private String tokenType;

    @JsonProperty("expires_in")
    private long expiresIn;

    private String scope;

    /** JWT ID，实测响应含此字段，文档未列 */
    private String jti;

    /** refresh_token：文档未列，但授权码模式实测返回 */
    @JsonProperty("refresh_token")
    private String refreshToken;

    /** 授权码模式返回的用户信息；客户端模式为 null */
    @JsonProperty("account_info")
    private Map<String, Object> accountInfo;
}
