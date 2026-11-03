import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 构建版本标记。
 *
 * 为什么需要：E2E 反复遇到「代码改了但页面跑的是旧 dist」，靠人看界面判断不出来。
 *
 * 输出两个标识：
 * - app-version：语义版本（package.json），与后端 /api/version 对齐，检测前后端版本不一致；
 * - app-build / dist/version.txt：git short hash，前端启动时与服务器最新 version.txt 比对，
 *   检测「浏览器还在跑旧包」。
 */
function buildVersionPlugin() {
  let build = process.env.APP_VERSION || 'unknown'
  try {
    build = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim() || build
  } catch {
    // 非 git 环境（如源码包）退回 unknown，不阻断构建
  }

  let appVersion = '1.0.0'
  try {
    appVersion = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')).version || appVersion
  } catch {
    // package.json 读不到时保留默认版本
  }

  return {
    name: 'fams-build-version',
    apply: 'build',
    config() {
      // 让源码能读到构建号：typeof __APP_BUILD__ === 'undefined' 时说明在 dev 模式
      return { define: { __APP_BUILD__: JSON.stringify(build) } }
    },
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta name="app-version" content="${appVersion}" />\n    <meta name="app-build" content="${build}" />`
      )
    },
    closeBundle() {
      try {
        writeFileSync(resolve(process.cwd(), 'dist/version.txt'), `${build}\n`, 'utf8')
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
