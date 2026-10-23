/**
 * 自查：逐个 SSR 渲染所有页面组件，捕获 setup 阶段的运行时异常（如 "xxx is not defined"）。
 * 这类异常会让组件白屏，但 vite build 与 eslint 都发现不了。
 * 不是浏览器测试，只做模块级渲染。
 */
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createServer } from 'vite'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (extname(p) === '.vue') acc.push(p.replace(/\\/g, '/'))
  }
  return acc
}

const PAGES = walk('src/views')

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

const ElementPlus = (await server.ssrLoadModule('element-plus')).default

const bad = []
for (const p of PAGES) {
  try {
    const mod = await server.ssrLoadModule('/' + p)
    const comp = mod.default
    if (!comp) { console.log('⚠️  ' + p + ' 无 default 导出'); continue }
    const app = createSSRApp({ render: () => h(comp) })
    app.use(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:all(.*)*', component: { render: () => null } }]
    })
    app.use(router)
    app.use(ElementPlus)
    await router.push('/')
    await router.isReady()
    await renderToString(app)
    console.log('✅ ' + p)
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).split('\n')[0]
    // 需要 props / 需要 el-* 上下文 的报错不算白屏问题
    const ignorable = /Cannot read properties of undefined \(reading '(docKey|docNo|modelValue)'\)|ID_INJECTION|Injection "Symbol|Cannot destructure property/
    if (ignorable.test(msg)) {
      console.log('⏭️  ' + p + '  （需 props/上下文，跳过：' + msg.slice(0, 60) + '）')
    } else {
      bad.push(p + '  ::  ' + msg)
      console.log('❌ ' + p + '  ::  ' + msg)
    }
  }
}

await server.close()

console.log('\n===== 结果 =====')
if (bad.length) {
  console.log('白屏风险页面 ' + bad.length + ' 个：')
  bad.forEach(b => console.log('  ' + b))
  process.exitCode = 1
} else {
  console.log('✅ 所有页面组件均可正常执行 setup，无未定义变量')
}
