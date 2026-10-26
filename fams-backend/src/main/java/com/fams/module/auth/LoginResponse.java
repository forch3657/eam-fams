package com.fams.module.auth;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Map;

/**
 * 登录出参（契约 1.3）：{ token, user }。
 */
@Data
@AllArgsConstructor
public class LoginResponse {

    private String token;

    private Map<String, Object> user;
}
