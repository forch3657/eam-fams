import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
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
  }
})
