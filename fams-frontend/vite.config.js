import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 构建版本标记。
 *
 * 为什么需要：E2E 反复遇到「代码改了但页面跑的是旧 dist」，靠人看界面判断不出来。
 * 构建时把 git short hash 写进 index.html 的 meta 与 dist/version.txt，
 * 用例断言「服务端返回的 version.txt == 本地构建产物」，一眼定位部署态不一致。
 */
function buildVersionPlugin() {
  let version = process.env.APP_VERSION || 'unknown'
  try {
    version = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim() || version
  } catch {
    // 非 git 环境（如源码包）退回 unknown，不阻断构建
  }
  return {
    name: 'fams-build-version',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta name="app-version" content="${version}" />`
      )
    },
    closeBundle() {
      try {
        writeFileSync(resolve(process.cwd(), 'dist/version.txt'), `${version}\n`, 'utf8')
      } catch {
        // dist 不存在时忽略（例如被外部清理）
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), buildVersionPlugin()],
  // 必须用根路径：'./' 会让 /system/user 这类两级路由把资源解析成 /system/assets/*，
  // 命中 nginx 的 SPA 回退返回 index.html，结果是整页白屏（MIME type text/html）。
  base: '/',
  server: {
    port: 5174,
    open: false,
    // 开发态把 /api 代理到后端，避免跨域；生产环境同域由 nginx 承担（见 deploy/nginx）。
    // 这是 CI 里跑 E2E 的前提：单源 http://localhost:5174 同时提供前端与 API。
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    strictPort: true,
    // E2E 专用：preview 托管 dist 并把 /api 反代到 18080 的测试后端
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  }
})
