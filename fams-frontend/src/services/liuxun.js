/**
 * 柳讯开放能力平台对接。
 *
 * 后端 /api/auth/liuxun/config 下发配置（含 mock 标记与授权页地址），
 * 前端不写死 IP：本机/测试环境/公网映射只改后端 profile 配置即可。
 *
 * - /oauth/entry：免登入口，无会话时跳柳讯授权页（mock 模式由后端返回本地入口）
 * - /oauth/callback：授权回调，拿 code 换本地 JWT，复用登录态写入逻辑
 */
import { request } from './http'
import { setToken } from './auth'

let configCache = null

export async function liuxunConfig(refresh = false) {
  if (configCache && !refresh) return configCache
  try {
    configCache = await request('/auth/liuxun/config')
    return configCache
  } catch (e) {
    console.error('[liuxun] 读取配置失败', e)
    return { mock: true, authorizeUrl: '/oauth/entry?mock=1', clientId: '', appId: '', redirectUri: '' }
  }
}

/** 用授权码换本地会话，返回 { token, user } */
export async function exchangeCode(code) {
  return request('/auth/liuxun/token', { method: 'POST', data: { code } })
}

/**
 * 与 store/user.js 登录成功后的会话写入保持一致：
 * 先写 token，再加载组织主数据，最后写用户快照。
 * 这里只做 token 写入 + 返回数据，由调用方决定跳转。
 */
export function applySession(res) {
  const token = res?.token || ''
  if (!token) throw new Error('柳讯登录未返回 token')
  setToken(token)
  return res.user || {}
}

/** mock 自检：验证预置账号免登 + 待办 CRUD 链路（未预置账号应被拒绝） */
export async function mockSelfTest() {
  return request('/auth/liuxun/mock-selftest', { method: 'POST', data: {} })
}
