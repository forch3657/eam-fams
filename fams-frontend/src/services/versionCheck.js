/**
 * 客户端版本一致性检查（仅生产构建启用）。
 *
 * 解决「代码已修、浏览器还跑旧包」：构建时把语义版本与 git 构建号写进
 * index.html 的 meta，并产出 dist/version.txt。运行时比对两件事：
 *
 * 1. `/api/version` 与 meta[name=app-version]：前后端是否同一次发布；
 * 2. 服务器最新的 `/version.txt` 与本地构建号：浏览器里跑的是不是旧包。
 *
 * 任一不一致就在顶部提示刷新。dev 模式（vite dev server）不启用，
 * 避免热更新期间反复提示。
 */

const META_VERSION = 'meta[name="app-version"]'

function currentBuild() {
  try {
    return typeof __APP_BUILD__ === 'undefined' ? '' : __APP_BUILD__
  } catch {
    return ''
  }
}

/**
 * @returns {Promise<string[]|null>} 不一致原因；一致或非生产环境返回 null
 */
export async function checkClientVersion() {
  if (!import.meta.env.PROD) return null

  const issues = []
  const metaVersion = document.querySelector(META_VERSION)?.content || ''
  const metaBuild = document.querySelector('meta[name="app-build"]')?.content || currentBuild()

  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (res.ok) {
      const body = await res.json()
      const serverVersion = body?.data?.version
      if (serverVersion && metaVersion && String(serverVersion) !== metaVersion) {
        issues.push(`后端已更新到 v${serverVersion}，当前页面为 v${metaVersion}`)
      }
    }
  } catch {
    // 版本检查失败不能影响正常使用
  }

  try {
    const res = await fetch(`/version.txt?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) {
      const latest = (await res.text()).trim()
      if (latest && metaBuild && latest !== metaBuild) {
        issues.push('服务器已发布新版本')
      }
    }
  } catch {
    // 静态版本文件缺失（如非标准部署）时忽略
  }

  return issues.length ? issues : null
}
