/**
 * 静态检查：扫描 .vue 模板里调用的函数，确认在 <script setup> 中已定义。
 * 用法：node .chkfn.cjs
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, 'src')
const files = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (name.endsWith('.vue')) files.push(p)
  }
})(root)

const GLOBALS = new Set([
  'Math', 'Number', 'String', 'Boolean', 'Date', 'JSON', 'Object', 'Array', 'Set', 'Map',
  'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'console',
  'var', 'calc', 'min', 'max', 'clamp',
  'if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'true', 'false', 'null', 'undefined'
])

let problems = 0
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  const tpl = raw.match(/<template>([\s\S]*)<\/template>/)
  const script = raw.match(/<script[^>]*>([\s\S]*)<\/script>/)
  if (!tpl || !script) continue
  const code = script[1]
  const defined = new Set()
  const decl = /(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g
  let m
  while ((m = decl.exec(code))) defined.add(m[1])
  const importRe = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g
  while ((m = importRe.exec(code))) {
    if (m[1]) defined.add(m[1])
    if (m[2]) m[2].split(',').forEach(s => {
      const name = s.split(' as').pop().trim()
      if (name) defined.add(name)
    })
  }

  // 模板中出现的函数调用（跳过对象方法调用 xxx() 与 CSS var()）
  const calls = new Set()
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g
  const tplBody = tpl[1].replace(/<!--[\s\S]*?-->/g, '')
  while ((m = callRe.exec(tplBody))) {
    const before = tplBody[m.index - 1] || ''
    if (before === '.' || before === '-') continue
    calls.add(m[1])
  }

  for (const fn of calls) {
    if (GLOBALS.has(fn) || defined.has(fn)) continue
    // 组件名（首字母大写）视为已注册组件
    if (/^[A-Z]/.test(fn)) continue
    console.log(`✗ ${path.relative(root, file)}: 模板调用了未定义的函数 ${fn}()`)
    problems++
  }
}
console.log(problems ? `\n发现 ${problems} 处问题` : '模板函数检查通过 ✅')
process.exit(problems ? 1 : 0)
