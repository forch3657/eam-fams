import { computed, ref } from 'vue'
import {
  BREAKPOINTS,
  HEIGHT_BREAKPOINTS,
  tierOf,
  deviceOf
} from '../constants/breakpoints'

/**
 * 设备态单例：模块级共享响应式状态 + 一组 matchMedia 监听。
 * 全应用只注册一次，组件多次调用 useBreakpoint() 不会新增监听器或重复重渲染。
 * 档位判定 O(1)，读值走 computed 缓存。
 */
const hasWindow = typeof window !== 'undefined'

const width = ref(hasWindow ? window.innerWidth : 1440)
const height = ref(hasWindow ? window.innerHeight : 900)
const orientation = ref(hasWindow && height.value > width.value ? 'portrait' : 'landscape')

const tier = computed(() => tierOf(width.value))
const device = computed(() => deviceOf(width.value))
const isPhone = computed(() => device.value === 'phone')
const isTablet = computed(() => device.value === 'tablet')
const isDesktop = computed(() => device.value === 'desktop')
const isMobile = computed(() => device.value !== 'desktop')
const isLandscape = computed(() => orientation.value === 'landscape')
const isPortrait = computed(() => orientation.value === 'portrait')
const isShort = computed(() => height.value <= HEIGHT_BREAKPOINTS.short)
const isVeryShort = computed(() => height.value <= HEIGHT_BREAKPOINTS.veryShort)

const state = Object.freeze({
  width,
  height,
  orientation,
  tier,
  device,
  isPhone,
  isTablet,
  isDesktop,
  isMobile,
  isLandscape,
  isPortrait,
  isShort,
  isVeryShort
})

const MEDIA_QUERIES = [
  `(min-width: ${BREAKPOINTS.sm}px)`,
  `(min-width: ${BREAKPOINTS.md}px)`,
  `(min-width: ${BREAKPOINTS.lg}px)`,
  `(min-width: ${BREAKPOINTS.xl}px)`,
  `(min-width: ${BREAKPOINTS.xxl}px)`,
  `(max-height: ${HEIGHT_BREAKPOINTS.short}px)`,
  `(max-height: ${HEIGHT_BREAKPOINTS.veryShort}px)`,
  '(orientation: landscape)'
]

let started = false
let mediaList = []
let frame = 0

function readViewport() {
  const w = window.innerWidth || document.documentElement.clientWidth || 1440
  const h = window.innerHeight || document.documentElement.clientHeight || 900
  if (w !== width.value) width.value = w
  if (h !== height.value) height.value = h
  const next = h > w ? 'portrait' : 'landscape'
  if (next !== orientation.value) orientation.value = next
}

function scheduleRead() {
  if (frame) return
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : cb => setTimeout(cb, 16)
  frame = raf(() => {
    frame = 0
    readViewport()
  })
}

function listen(mql) {
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', scheduleRead)
  else if (typeof mql.addListener === 'function') mql.addListener(scheduleRead)
}

function unlisten(mql) {
  if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', scheduleRead)
  else if (typeof mql.removeListener === 'function') mql.removeListener(scheduleRead)
}

function ensure() {
  if (started || !hasWindow || typeof window.matchMedia !== 'function') return
  started = true
  mediaList = MEDIA_QUERIES.map(q => {
    const mql = window.matchMedia(q)
    listen(mql)
    return mql
  })
  window.addEventListener('resize', scheduleRead, { passive: true })
  window.addEventListener('orientationchange', scheduleRead, { passive: true })
  // 移动端 emulation / viewport meta 解析可能晚于模块加载：监听视觉视口并在下一帧重读，
  // 否则首帧读到 980 后若没有 resize 事件，手机会一直停留在桌面布局。
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleRead, { passive: true })
  readViewport()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(readViewport)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleRead, { once: true })
}

/** 仅供 HMR / 测试卸载，业务代码不要调用 */
export function disposeBreakpoint() {
  if (!started) return
  mediaList.forEach(unlisten)
  mediaList = []
  window.removeEventListener('resize', scheduleRead)
  window.removeEventListener('orientationchange', scheduleRead)
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', scheduleRead)
  if (frame) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    else clearTimeout(frame)
    frame = 0
  }
  started = false
}

if (import.meta.hot) import.meta.hot.dispose(disposeBreakpoint)

export function useBreakpoint() {
  ensure()
  return state
}
