/**
 * 响应式断点单一真源（JS 侧）
 *
 * 设备矩阵、档位语义、分阶段规划见 docs/responsive-adaptation.md。
 * CSS 的 @media 条件不支持自定义属性，因此字面量集中在 global.css 顶部断点注释块，
 * 由 tests/responsive/breakpoints.spec.ts 断言两侧数值一致，禁止单侧修改。
 */

export const BREAKPOINTS = Object.freeze({
  xs: 0,
  sm: 576,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1600
})

export const HEIGHT_BREAKPOINTS = Object.freeze({
  short: 800,
  veryShort: 500
})

/** width < PHONE_MAX 走完整移动体验；width < TABLET_MAX 统称非桌面 */
export const PHONE_MAX = BREAKPOINTS.md
export const TABLET_MAX = BREAKPOINTS.lg

export const TIER_NAMES = Object.freeze(['xxl', 'xl', 'lg', 'md', 'sm', 'xs'])

/** 机器可读的规格行：global.css 顶部注释块必须逐字包含这两行 */
export const BREAKPOINT_SPEC_LINE =
  `BREAKPOINT_SPEC: xs=${BREAKPOINTS.xs} sm=${BREAKPOINTS.sm} md=${BREAKPOINTS.md} lg=${BREAKPOINTS.lg} xl=${BREAKPOINTS.xl} xxl=${BREAKPOINTS.xxl}`
export const HEIGHT_SPEC_LINE =
  `HEIGHT_SPEC: short=${HEIGHT_BREAKPOINTS.short} veryShort=${HEIGHT_BREAKPOINTS.veryShort}`

/** 由 CSS 像素宽度解析档位，O(1) */
export function tierOf(width) {
  const w = Number(width) || 0
  if (w >= BREAKPOINTS.xxl) return 'xxl'
  if (w >= BREAKPOINTS.xl) return 'xl'
  if (w >= BREAKPOINTS.lg) return 'lg'
  if (w >= BREAKPOINTS.md) return 'md'
  if (w >= BREAKPOINTS.sm) return 'sm'
  return 'xs'
}

/** phone / tablet / desktop 三分类 */
export function deviceOf(width) {
  const w = Number(width) || 0
  if (w < PHONE_MAX) return 'phone'
  if (w < TABLET_MAX) return 'tablet'
  return 'desktop'
}

/**
 * 代表巡检视口：覆盖 PC / 平板 / 手机 × 横竖屏 × 矮屏，与规划文档 §2.5 一一对应。
 * tier / device / isMobile 由上面的函数派生，避免手写档位产生漂移。
 */
const RAW_VIEWPORTS = [
  { name: 'pc-1366', label: 'PC 1366×768', width: 1366, height: 768, dpr: 1, orientation: 'landscape' },
  { name: 'pc-1440', label: 'PC 1440×900（既有基线）', width: 1440, height: 900, dpr: 1, orientation: 'landscape' },
  { name: 'pc-1920', label: 'PC 1920×1080', width: 1920, height: 1080, dpr: 1, orientation: 'landscape' },
  { name: 'pc-2560', label: 'PC 2560×1440 超宽', width: 2560, height: 1440, dpr: 1, orientation: 'landscape' },
  { name: 'pc-short', label: 'PC 1366×640 分屏矮屏', width: 1366, height: 640, dpr: 1, orientation: 'landscape' },
  { name: 'tablet-portrait', label: '平板竖 768×1024', width: 768, height: 1024, dpr: 2, orientation: 'portrait' },
  { name: 'tablet-landscape', label: '平板横 1024×768', width: 1024, height: 768, dpr: 2, orientation: 'landscape' },
  { name: 'tablet-large-portrait', label: '大平板竖 1024×1366', width: 1024, height: 1366, dpr: 2, orientation: 'portrait' },
  { name: 'tablet-large-landscape', label: '大平板横 1366×1024', width: 1366, height: 1024, dpr: 2, orientation: 'landscape' },
  { name: 'phone-small', label: '小手机竖 360×800', width: 360, height: 800, dpr: 3, orientation: 'portrait' },
  { name: 'phone', label: '主流手机竖 390×844', width: 390, height: 844, dpr: 3, orientation: 'portrait' },
  { name: 'phone-large', label: '大手机竖 430×932', width: 430, height: 932, dpr: 3, orientation: 'portrait' },
  { name: 'phone-fold', label: '折叠外屏竖 344×742', width: 344, height: 742, dpr: 3, orientation: 'portrait' },
  { name: 'phone-landscape', label: '手机横 844×390', width: 844, height: 390, dpr: 3, orientation: 'landscape' },
  { name: 'phone-large-landscape', label: '大手机横 932×430', width: 932, height: 430, dpr: 3, orientation: 'landscape' }
]

export const VIEWPORT_MATRIX = Object.freeze(
  RAW_VIEWPORTS.map(v => Object.freeze({
    ...v,
    tier: tierOf(v.width),
    device: deviceOf(v.width),
    isMobile: deviceOf(v.width) !== 'desktop'
  }))
)
