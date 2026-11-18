/**
 * 多视口巡检矩阵。数值与 docs/responsive-adaptation.md §2.5、
 * fams-frontend/src/constants/breakpoints.js 的 VIEWPORT_MATRIX 保持一致，
 * 由 breakpoints.spec.ts 断言三者不漂移。
 */
export type Tier = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
export type Device = 'phone' | 'tablet' | 'desktop'

export type Viewport = {
  name: string
  label: string
  width: number
  height: number
  dpr: number
  orientation: 'portrait' | 'landscape'
  tier: Tier
  device: Device
  isMobile: boolean
}

export const VIEWPORTS: Viewport[] = [
  { name: 'pc-1366', label: 'PC 1366x768', width: 1366, height: 768, dpr: 1, orientation: 'landscape', tier: 'xl', device: 'desktop', isMobile: false },
  { name: 'pc-1440', label: 'PC 1440x900 基线', width: 1440, height: 900, dpr: 1, orientation: 'landscape', tier: 'xl', device: 'desktop', isMobile: false },
  { name: 'pc-1920', label: 'PC 1920x1080', width: 1920, height: 1080, dpr: 1, orientation: 'landscape', tier: 'xxl', device: 'desktop', isMobile: false },
  { name: 'pc-2560', label: 'PC 2560x1440 超宽', width: 2560, height: 1440, dpr: 1, orientation: 'landscape', tier: 'xxl', device: 'desktop', isMobile: false },
  { name: 'pc-short', label: 'PC 1366x640 矮屏', width: 1366, height: 640, dpr: 1, orientation: 'landscape', tier: 'xl', device: 'desktop', isMobile: false },
  { name: 'tablet-portrait', label: '平板竖 768x1024', width: 768, height: 1024, dpr: 2, orientation: 'portrait', tier: 'md', device: 'tablet', isMobile: true },
  { name: 'tablet-landscape', label: '平板横 1024x768', width: 1024, height: 768, dpr: 2, orientation: 'landscape', tier: 'lg', device: 'desktop', isMobile: false },
  { name: 'tablet-large-portrait', label: '大平板竖 1024x1366', width: 1024, height: 1366, dpr: 2, orientation: 'portrait', tier: 'lg', device: 'desktop', isMobile: false },
  { name: 'tablet-large-landscape', label: '大平板横 1366x1024', width: 1366, height: 1024, dpr: 2, orientation: 'landscape', tier: 'xl', device: 'desktop', isMobile: false },
  { name: 'phone-small', label: '小手机竖 360x800', width: 360, height: 800, dpr: 3, orientation: 'portrait', tier: 'xs', device: 'phone', isMobile: true },
  { name: 'phone', label: '主流手机竖 390x844', width: 390, height: 844, dpr: 3, orientation: 'portrait', tier: 'xs', device: 'phone', isMobile: true },
  { name: 'phone-large', label: '大手机竖 430x932', width: 430, height: 932, dpr: 3, orientation: 'portrait', tier: 'xs', device: 'phone', isMobile: true },
  { name: 'phone-fold', label: '折叠外屏竖 344x742', width: 344, height: 742, dpr: 3, orientation: 'portrait', tier: 'xs', device: 'phone', isMobile: true },
  { name: 'phone-se-landscape', label: '小手机横 667x375', width: 667, height: 375, dpr: 2, orientation: 'landscape', tier: 'sm', device: 'phone', isMobile: true },
  { name: 'phone-landscape', label: '手机横 844x390', width: 844, height: 390, dpr: 3, orientation: 'landscape', tier: 'md', device: 'tablet', isMobile: true },
  { name: 'phone-large-landscape', label: '大手机横 932x430', width: 932, height: 430, dpr: 3, orientation: 'landscape', tier: 'md', device: 'tablet', isMobile: true }
]

/** 21 个路由：router/index.js 的完整清单，逐页都要过布局断言 */
export const ROUTES = [
  { path: '/login', name: '登录' },
  { path: '/403', name: '无访问权限' },
  { path: '/workbench', name: '工作台' },
  { path: '/fixed-assets', name: '资产管理' },
  { path: '/fixed-asset-reports', name: '资产报表' },
  { path: '/fixed-asset-settings', name: '基础设置' },
  { path: '/low-value-assets', name: '低值资产管理' },
  { path: '/low-value-asset-reports', name: '低值资产报表' },
  { path: '/low-value-asset-settings', name: '低值资产基础设置' },
  { path: '/system/company', name: '公司管理' },
  { path: '/system/dept', name: '部门管理' },
  { path: '/system/user', name: '用户管理' },
  { path: '/system/role', name: '角色管理' },
  { path: '/system/dict', name: '数据字典' },
  { path: '/system/log', name: '操作日志' },
  { path: '/system/workflow', name: '流程配置' },
  { path: '/system/params', name: '系统参数' },
  { path: '/system/message-center', name: '消息中心' },
  { path: '/system/message-template', name: '消息模板' },
  { path: '/system/terminal', name: '盘点终端' },
  { path: '/system/data-import', name: '数据导入' }
]

/** 截图归档的代表路由，避免为 15x21 组合都落盘 */
export const SHOT_ROUTES = ['/workbench', '/system/params']
