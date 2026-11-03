#!/usr/bin/env node
/**
 * 夜间回归质量简报生成器。
 *
 * 输入：Playwright JSON reporter 的输出（夜间任务跑 L4 用例时产生）
 * 输出：e2e-artifacts/nightly/<runId>/report.md —— 可存档、可对比的质量简报
 *
 * 指标口径（与《测试体系整改计划》第六节一致）：
 * - 未预期 4xx/5xx：失败信息里出现的 `4xx/5xx 方法 路径` 去重计数，目标 0
 * - 权限矩阵覆盖率：12-role-permission-matrix 的通过用例 / 总用例
 * - 角色旅程覆盖率：14-persona-journeys 中通过的人设旅程数 / 期望旅程数
 * - 逃逸缺陷回灌率：台账里有对应用例编号的条目 / 全部条目
 *
 * 为什么单独用 mjs 而不是 PowerShell：.ps1 必须保持 ASCII 才能被
 * PowerShell 5.1 正确解析，简报需要中文标题与结论。
 */
import fs from 'node:fs'
import path from 'node:path'

const runId = process.env.NIGHTLY_RUN_ID ?? new Date().toISOString().slice(0, 10)
const jsonPath = process.argv[2]
const outDir = process.argv[3] ?? path.resolve(process.cwd(), 'e2e-artifacts/nightly', runId)
const defectsPath = path.resolve(process.cwd(), 'docs/qa/escaped-defects.md')

if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(`[nightly] 找不到 Playwright JSON 报告：${jsonPath}`)
  process.exit(1)
}

const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const specs = flatten(report)
const failed = specs.filter(s => !s.ok)
const errors = specs.flatMap(s => s.errors)

/** 收集所有失败信息里的真实 HTTP 失败（同一接口只记一条） */
const httpFailures = new Map()
for (const message of errors) {
  for (const hit of message.matchAll(/(\d{3})\s+(GET|POST|PUT|DELETE|PATCH)\s+(\/api\/[^\s"'）)]+)/g)) {
    const key = `${hit[1]} ${hit[2]} ${hit[3]}`
    httpFailures.set(key, (httpFailures.get(key) ?? 0) + 1)
  }
}

const byFile = new Map()
for (const spec of specs) {
  const file = path.basename(spec.file)
  const bucket = byFile.get(file) ?? { total: 0, passed: 0, failed: [] }
  bucket.total += 1
  if (spec.ok) bucket.passed += 1
  else bucket.failed.push(spec.title)
  byFile.set(file, bucket)
}

const matrix = byFile.get('12-role-permission-matrix.spec.ts')
const journeys = byFile.get('14-persona-journeys.spec.ts')
const JOURNEY_EXPECTED = Number(process.env.NIGHTLY_JOURNEY_EXPECTED ?? 3)
const journeyPassed = journeys?.passed ?? 0
const journeyRate = Math.min(100, Math.round((journeyPassed / JOURNEY_EXPECTED) * 100))
const matrixRate = matrix ? Math.round((matrix.passed / matrix.total) * 100) : 0

const defects = readDefects()
const feedbackRate = defects.total ? Math.round((defects.withCase / defects.total) * 100) : 0

const lines = []
lines.push(`# 夜间回归质量简报 ${runId}`)
lines.push('')
lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`)
lines.push(`- 数据来源：生产库只读副本上的 L4 数据形态回归（不动生产库）`)
lines.push('')
lines.push('## 一、结论')
lines.push('')
const ok = failed.length === 0 && httpFailures.size === 0
lines.push(`- 总体结果：**${ok ? '通过' : '未通过'}**（用例 ${specs.length} 条，失败 ${failed.length} 条）`)
lines.push(`- 重试后通过（flaky）：**${report.stats?.flaky ?? 0}** 条${report.stats?.flaky ? '，需复查是否为不稳定用例' : ''}`)
lines.push(`- 未预期 4xx/5xx：**${httpFailures.size}** 个接口${httpFailures.size ? '（见第三节）' : '，达标'}`)
lines.push(`- 权限矩阵覆盖率：**${matrixRate}%**${matrix ? `（${matrix.passed}/${matrix.total}）` : '（本轮未跑矩阵）'}`)
lines.push(`- 角色旅程覆盖率：**${journeyRate}%**（通过 ${journeyPassed}/${JOURNEY_EXPECTED} 条人设旅程）`)
lines.push(`- 逃逸缺陷回灌率：**${feedbackRate}%**（${defects.withCase}/${defects.total} 条有对应用例）`)
lines.push('')
lines.push('## 二、用例明细')
lines.push('')
lines.push('| 用例文件 | 通过 | 总数 | 通过率 |')
lines.push('|---|---|---|---|')
for (const [file, bucket] of [...byFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const rate = Math.round((bucket.passed / bucket.total) * 100)
  lines.push(`| ${file} | ${bucket.passed} | ${bucket.total} | ${rate}% |`)
}
if (failed.length) {
  lines.push('')
  lines.push('### 失败用例')
  lines.push('')
  for (const spec of failed) lines.push(`- \`${spec.title}\`（${path.basename(spec.file)}）`)
}
lines.push('')
lines.push('## 三、未预期接口失败')
lines.push('')
if (httpFailures.size === 0) {
  lines.push('无。')
} else {
  lines.push('| 状态 | 方法 | 路径 | 出现次数 |')
  lines.push('|---|---|---|---|')
  for (const [key, count] of httpFailures) {
    const [status, method, url] = key.split(' ')
    lines.push(`| ${status} | ${method} | ${url} | ${count} |`)
  }
}
lines.push('')
lines.push('## 四、逃逸缺陷')
lines.push('')
lines.push(`- 台账条目：${defects.total} 条，已闭环 ${defects.closed} 条，未闭环 ${defects.total - defects.closed} 条`)
lines.push(`- 其中已补对应用例：${defects.withCase} 条`)
if (defects.open.length) {
  lines.push(`- 未闭环：${defects.open.map(id => `\`${id}\``).join('、')}`)
}
lines.push('')
lines.push('## 五、后续动作')
lines.push('')
if (ok && journeyRate === 100 && matrixRate === 100) {
  lines.push('- 本轮无阻断问题，保持夜间任务连续运行并对比下周趋势。')
} else {
  if (httpFailures.size) lines.push('- 先修接口失败：按第三节逐条定位，禁止用整页 4xx 豁免掩盖。')
  if (failed.length) lines.push('- 失败用例当天登记到 `docs/qa/escaped-defects.md`，并补 `[BUG-xxx]` 回归。')
  if (journeyRate < 100) lines.push('- 人设旅程未覆盖完整角色：补齐建单→提交→审批→完结链路。')
  if (matrixRate < 100) lines.push('- 权限矩阵有红灯：核对角色权限集是否被业务改动。')
}
lines.push('')

fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'report.md')
fs.writeFileSync(outFile, lines.join('\n'), 'utf8')
console.log(`[nightly] 简报已生成：${outFile}`)
console.log(`[nightly] 用例 ${specs.length}，失败 ${failed.length}，未预期接口失败 ${httpFailures.size}`)
process.exit(ok ? 0 : 1)

/** 把 Playwright 的嵌套 suites 拍平成「一条 test = 一条 spec」 */
function flatten(root) {
  const out = []
  const walk = suite => {
    for (const child of suite.suites ?? []) walk(child)
    for (const spec of suite.specs ?? []) {
      const results = spec.tests?.flatMap(t => t.results ?? []) ?? []
      const errors = results.map(r => r.error?.message ?? '').filter(Boolean)
      out.push({
        title: spec.title,
        file: spec.file ?? suite.file ?? '',
        ok: Boolean(spec.ok) && errors.length === 0,
        errors
      })
    }
  }
  for (const suite of report.suites ?? []) walk(suite)
  return out
}

/** 解析逃逸缺陷台账表格：编号、状态、对应用例 */
function readDefects() {
  const result = { total: 0, closed: 0, withCase: 0, open: [] }
  if (!fs.existsSync(defectsPath)) return result
  const text = fs.readFileSync(defectsPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*BUG-\d+/.test(line)) continue
    const cells = line.split('|').map(c => c.trim())
    // cells[0] 为空（行首竖线），编号在 [1]
    const id = cells[1]
    const status = cells[8] ?? ''
    const cases = cells[6] ?? ''
    result.total += 1
    if (status.includes('已闭环')) result.closed += 1
    else result.open.push(id)
    if (cases.includes('[')) result.withCase += 1
  }
  return result
}
