import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { VIEWPORTS, ROUTES, type Tier, type Device } from './fixtures/viewports'

const ROOT = path.resolve(__dirname, '../..')
const CSS_PATH = path.join(ROOT, 'fams-frontend/src/styles/global.css')
const JS_PATH = path.join(ROOT, 'fams-frontend/src/constants/breakpoints.js')
const DOC_PATH = path.join(ROOT, 'docs/responsive-adaptation.md')

function read(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

/** 从 `export const X = Object.freeze({...})` 提取键值对 */
function jsObject(source: string, name: string): Record<string, number> {
  const block = new RegExp(`export const ${name} = Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\)`).exec(source)
  expect(block, `找不到 ${name} 定义`).not.toBeNull()
  const out: Record<string, number> = {}
  for (const m of block![1].matchAll(/(\w+):\s*(\d+)/g)) out[m[1]] = Number(m[2])
  return out
}

/** 从 global.css 顶部注释块提取 BREAKPOINT_SPEC / HEIGHT_SPEC 行 */
function cssSpec(source: string, prefix: string): Record<string, number> {
  const line = new RegExp(`${prefix}:\\s*([^\\r\\n]+)`).exec(source)
  expect(line, `global.css 缺少 ${prefix} 规格行`).not.toBeNull()
  const out: Record<string, number> = {}
  for (const m of line![1].matchAll(/(\w+)=(\d+)/g)) out[m[1]] = Number(m[2])
  return out
}

function tierOf(width: number, bp: Record<string, number>): Tier {
  if (width >= bp.xxl) return 'xxl'
  if (width >= bp.xl) return 'xl'
  if (width >= bp.lg) return 'lg'
  if (width >= bp.md) return 'md'
  if (width >= bp.sm) return 'sm'
  return 'xs'
}

function deviceOf(width: number, bp: Record<string, number>): Device {
  if (width < bp.md) return 'phone'
  if (width < bp.lg) return 'tablet'
  return 'desktop'
}

test('[RESP-BP-01] CSS 断点规格与 JS 常量一致', () => {
  const js = read(JS_PATH)
  const css = read(CSS_PATH)
  expect(cssSpec(css, 'BREAKPOINT_SPEC')).toEqual(jsObject(js, 'BREAKPOINTS'))
  expect(cssSpec(css, 'HEIGHT_SPEC')).toEqual(jsObject(js, 'HEIGHT_BREAKPOINTS'))
})

test('[RESP-BP-02] 巡检视口的档位与设备分类可由同一常量复算', () => {
  const bp = jsObject(read(JS_PATH), 'BREAKPOINTS')
  for (const vp of VIEWPORTS) {
    expect(vp.tier, `${vp.name} tier`).toBe(tierOf(vp.width, bp))
    expect(vp.device, `${vp.name} device`).toBe(deviceOf(vp.width, bp))
    expect(vp.isMobile, `${vp.name} isMobile`).toBe(vp.device !== 'desktop')
    expect(vp.orientation, `${vp.name} orientation`).toBe(vp.height > vp.width ? 'portrait' : 'landscape')
  }
})

test('[RESP-BP-03] 矩阵覆盖全部档位、横竖屏与矮屏，路由覆盖 21 页', () => {
  const tiers = new Set(VIEWPORTS.map(v => v.tier))
  expect([...tiers].sort()).toEqual(['lg', 'md', 'sm', 'xl', 'xs', 'xxl'].sort())
  expect(VIEWPORTS.some(v => v.orientation === 'portrait')).toBe(true)
  expect(VIEWPORTS.some(v => v.orientation === 'landscape')).toBe(true)
  expect(VIEWPORTS.some(v => v.height <= 500)).toBe(true)
  expect(VIEWPORTS.length).toBe(16)
  expect(ROUTES.length).toBe(21)
  expect(new Set(ROUTES.map(r => r.path)).size).toBe(21)
  expect(read(DOC_PATH)).toContain('统一断点分级表')
})

test('[RESP-BP-04] 前端断点真源文件存在且 viewport-fit 已启用', () => {
  const html = read(path.join(ROOT, 'fams-frontend/index.html'))
  expect(html).toContain('viewport-fit=cover')
  expect(read(JS_PATH)).toContain('VIEWPORT_MATRIX')
  expect(read(CSS_PATH)).toContain('data-table-label')
})
