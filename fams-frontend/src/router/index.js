import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../store/user'
import { useAuditStore } from '../store/audit'
import { useOrgStore } from '../store/org'
import { setUnauthorizedHandler } from '../services/http'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' }
  },
  {
    path: '/403',
    name: 'NoPermission',
    component: () => import('../views/system/NoPermission.vue'),
    meta: { title: '无访问权限' }
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/workbench',
    children: [
      {
        path: 'workbench',
        name: 'Workbench',
        component: () => import('../views/workbench/Workbench.vue'),
        meta: { title: '工作台', permission: 'wm:view' }
      },
      {
        path: 'fixed-assets',
        name: 'FixedAssets',
        component: () => import('../views/fixed-asset/FixedAssetManagement.vue'),
        meta: { title: '资产管理', permission: 'fa:view' }
      },
      {
        path: 'fixed-asset-reports',
        name: 'FixedAssetReports',
        component: () => import('../views/fixed-asset/FixedAssetReports.vue'),
        meta: { title: '资产报表', permission: 'fa:report' }
      },
      {
        path: 'fixed-asset-settings',
        name: 'FixedAssetSettings',
        component: () => import('../views/fixed-asset/FixedAssetSettings.vue'),
        meta: { title: '基础设置', permission: 'fa:view' }
      },

      // 低值资产
      {
        path: 'low-value-assets',
        name: 'LowValueAssets',
        component: () => import('../views/low-value-asset/LowValueAssetManagement.vue'),
        meta: { title: '低值资产管理', permission: 'lv:view' }
      },
      {
        path: 'low-value-asset-reports',
        name: 'LowValueAssetReports',
        component: () => import('../views/low-value-asset/LowValueAssetReports.vue'),
        meta: { title: '低值资产报表', permission: 'lv:report' }
      },
      {
        path: 'low-value-asset-settings',
        name: 'LowValueAssetSettings',
        component: () => import('../views/low-value-asset/LowValueAssetSettings.vue'),
        meta: { title: '低值资产基础设置', permission: 'lv:view' }
      },

      // 组织架构
      {
        path: 'system/company',
        name: 'SystemCompany',
        component: () => import('../views/system/SystemCompany.vue'),
        meta: { title: '公司管理', permission: 'org:company' }
      },
      {
        path: 'system/dept',
        name: 'SystemDept',
        component: () => import('../views/system/SystemDept.vue'),
        meta: { title: '部门管理', permission: 'org:dept' }
      },
      {
        path: 'system/user',
        name: 'SystemUser',
        component: () => import('../views/system/SystemUser.vue'),
        meta: { title: '用户管理', permission: 'org:user' }
      },
      {
        path: 'system/role',
        name: 'SystemRole',
        component: () => import('../views/system/SystemRole.vue'),
        meta: { title: '角色管理', permission: 'org:role' }
      },

      // 系统管理
      {
        path: 'system/dict',
        name: 'SystemDict',
        component: () => import('../views/system/SystemDict.vue'),
        meta: { title: '数据字典', permission: 'sys:dict' }
      },
      {
        path: 'system/log',
        name: 'SystemLog',
        component: () => import('../views/system/SystemLog.vue'),
        meta: { title: '操作日志', permission: 'sys:log' }
      },
      {
        path: 'system/workflow',
        name: 'SystemWorkflow',
        component: () => import('../views/system/WorkflowConfig.vue'),
        meta: { title: '流程配置', permission: 'sys:workflow' }
      },
      {
        path: 'system/params',
        name: 'SystemParams',
        component: () => import('../views/system/SystemParams.vue'),
        meta: { title: '系统参数', permission: 'sys:params' }
      },
      {
        path: 'system/message-center',
        name: 'MessageCenter',
        component: () => import('../views/system/MessageCenter.vue'),
        meta: { title: '消息中心', permission: 'sys:message' }
      },
      {
        path: 'system/message-template',
        name: 'MessageTemplate',
        component: () => import('../views/system/MessageTemplate.vue'),
        meta: { title: '消息模板', permission: 'sys:template' }
      },
      {
        path: 'system/terminal',
        name: 'TerminalManage',
        component: () => import('../views/system/TerminalManage.vue'),
        meta: { title: '盘点终端', permission: 'sys:terminal' }
      },
      {
        path: 'system/data-import',
        name: 'SystemDataImport',
        component: () => import('../views/system/SystemDataImport.vue'),
        meta: { title: '数据导入', permission: 'sys:import' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/workbench' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

/** 无权访问时的落地页候选（按优先级） */
const FALLBACK_ROUTES = [
  { path: '/workbench', permission: 'wm:view' },
  { path: '/fixed-assets', permission: 'fa:view' },
  { path: '/low-value-assets', permission: 'lv:view' },
  { path: '/fixed-asset-reports', permission: 'fa:report' },
  { path: '/system/log', permission: 'sys:log' }
]

router.beforeEach(async (to) => {
  const userStore = useUserStore()

  if (to.path === '/login') {
    return userStore.isLoggedIn ? '/workbench' : true
  }

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    return '/login'
  }

  // 路由级鉴权：meta.permission 无权限时跳到可访问的首页
  const perm = to.meta.permission
  if (perm) {
    const orgStore = useOrgStore()
    if (!orgStore.loaded) await orgStore.loadAll()
    if (!userStore.can(perm)) {
      const fallback = FALLBACK_ROUTES.find(r => userStore.can(r.permission))
      return fallback ? fallback.path : '/403'
    }
  }

  return true
})

// 页面访问留痕：写入操作日志
router.afterEach((to) => {
  if (!to.meta?.title || to.path === '/login') return
  const userStore = useUserStore()
  if (!userStore.isLoggedIn) return
  const auditStore = useAuditStore()
  auditStore.logOp({
    module: '页面访问',
    action: '访问',
    target: to.meta.title,
    detail: `进入${to.meta.title}页面`
  })
})

/**
 * 401 统一处理：任何接口返回未登录/令牌失效，清空本地会话并跳登录。
 * 只做本地清理（clearSession），不再发请求，避免用失效 token 反复触发 401。
 */
setUnauthorizedHandler(() => {
  const userStore = useUserStore()
  const wasLoggedIn = userStore.isLoggedIn
  userStore.clearSession()
  if (wasLoggedIn && router.currentRoute.value.path !== '/login') {
    router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  }
})

export default router
