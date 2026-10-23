/**
 * 会话存储键（单一定义处）
 *
 * 这些键被 services / store 多处读写，若各写一份字符串字面量，
 * 一旦改键就会出现"这边写了那边读不到"的隐性断裂（审计字段恒为 system 就是这么来的）。
 */

/** 登录用户快照：store/user.js 写入，mock 引擎读取用于审计字段 createBy/updateBy */
export const USER_STORAGE_KEY = 'fams-user'

/** 访问令牌：services/auth.js 写入，services/http.js 每次请求读取放到 Authorization 头 */
export const TOKEN_STORAGE_KEY = 'token'
