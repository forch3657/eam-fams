package com.fams.module.auth;

import lombok.Data;

import javax.validation.constraints.NotBlank;

/**
 * 登录入参。
 */
@Data
public class LoginRequest {

    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;
}
