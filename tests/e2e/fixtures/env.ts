import path from 'node:path'

/** 被测地址：独立测试栈 4173 / 生产形态 http://localhost */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost'

/** 每轮运行的产物目录，形如 e2e-artifacts/2026-10-30T09-12-33 */
export const RUN_ID = process.env.E2E_RUN_ID ?? 'manual'
export const ARTIFACT_ROOT = path.resolve(process.cwd(), 'e2e-artifacts', RUN_ID)

/** 管理账号：需要全部权限，用于巡检与数据准备 */
export const ADMIN = {
  username: process.env.E2E_USERNAME ?? 'admin',
  password: process.env.E2E_PASSWORD ?? 'Fzidt@123'
}

/** 会话存储键，与 fams-frontend/src/services/keys.js 保持一致 */
export const STORAGE_KEYS = {
  user: 'fams-user',
  token: 'token'
}

/** 巡检视口，视觉基线也只按这一档维护 */
export const VIEWPORT = { width: 1440, height: 900 }
