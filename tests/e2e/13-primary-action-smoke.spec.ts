import { expect, test, type Locator } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, type TempUser } from './fixtures/data'
import { installGuards } from './fixtures/net'

/**
 * 主操作 dry-run 巡检。
 *
 * 「页面能打开」不等于「主操作能执行」：2026-11-02 用户点「新增领用」
 * 直接弹「无权限访问该数据」，而当时的全量用例全绿，因为没人点过新增按钮。
 *
 * 每条用例都走真实角色 → 页面 → 点主操作按钮 → 弹窗出现 → 校验默认值 → 取消，
 * 全程监听 /api/ 4xx 与错误提示；任何一个环节失败即判定不可用。
 *
 * 只读：只打开弹窗随后取消，不落任何业务数据。
 */

type Principal = {
  code: string
  session: Session
  user: TempUser
}

type PrimaryAction = {
  id: string
  title: string
  role: string
  path: string
  /** 主操作按钮文案 */
  button: RegExp
  /** 弹窗标题（用于确认打开的是预期弹窗） */
  dialogTitle: string
  /** 弹窗内的默认值断言 */
  check: (dialog: Locator, principal: Principal) => Promise<void>
}

/** 低值单据三个弹窗都有「数量」数字输入框，默认值必须是 1（不能空、不能 0） */
async function expectQuantityDefault(dialog: Locator, expected = '1') {
  const quantity = dialog.locator('.el-input-number input').first()
  await expect(quantity).toHaveValue(expected)
}

/** 定位表单项：这里的 label 都足够唯一（如「领用人」不会命中「领用物品」） */
function formItem(dialog: Locator, label: string): Locator {
  return dialog.locator('.el-form-item').filter({ hasText: label }).first()
}

/**
 * 点击「可见」的按钮。
 *
 * 低值页的主操作按钮在页头，不在 el-tab-pane 内；固资页则同时挂载 6 个单据面板，
 * 其中隐藏面板里也有同名「新增单据」按钮，直接 first() 会点到隐藏元素。
 */
async function clickVisibleButton(page: import('@playwright/test').Page, name: RegExp) {
  const buttons = page.getByRole('button', { name })
  const total = await buttons.count()
  for (let i = 0; i < total; i++) {
    const button = buttons.nth(i)
    if (await button.isVisible()) {
      await button.click()
      return
    }
  }
  throw new Error(`页面上找不到可见按钮：${name}`)
}

/**
 * 下拉框是否已选中值。
 *
 * el-select 内部的 input 是搜索框（value 恒为空），选中值以文本形式渲染在
 * `.el-select__selected-item` 里；未选中时会显示 placeholder 文案，
 * 因此按「表单项文本」断言比按内部节点更稳，也不依赖 Element Plus 的类名细节。
 */
async function expectSelectChosen(dialog: Locator, label: string, expected?: string) {
  const item = formItem(dialog, label)
  if (expected) {
    await expect(item).toContainText(expected)
    return
  }
  await expect(item).not.toContainText('请选择')
}

const ACTIONS: PrimaryAction[] = [
  {
    id: 'LV-INBOUND',
    title: '低值资产新增入库弹窗可正常打开',
    role: 'ROLE_WAREHOUSE',
    path: '/low-value-assets?tab=inbound',
    button: /新增入库/,
    dialogTitle: '新增入库',
    check: async dialog => {
      await expectQuantityDefault(dialog)
    }
  },
  {
    id: 'LV-REQUISITION',
    title: '低值资产新增领用弹窗可正常打开（BUG-001 回归）',
    role: 'ROLE_LEADER',
    path: '/low-value-assets?tab=requisition',
    button: /新增领用/,
    dialogTitle: '新增领用',
    check: async (dialog, principal) => {
      await expectQuantityDefault(dialog)
      // 领用人（下拉）按当前登录人带出，空着说明用户主数据没加载（待办解析也会跟着坏）
      await expectSelectChosen(dialog, '领用人', principal.user.name)
    }
  },
  {
    id: 'LV-RETURN',
    title: '低值资产新增退库弹窗可正常打开',
    role: 'ROLE_USER',
    path: '/low-value-assets?tab=return',
    button: /新增退库/,
    dialogTitle: '新增退库',
    check: async dialog => {
      await expectQuantityDefault(dialog)
    }
  },
  {
    id: 'FA-ALLOC',
    title: '固资新增派发单弹窗可正常打开',
    role: 'ROLE_ASSET',
    path: '/fixed-assets?tab=dispatch&sub=alloc',
    button: /新增单据/,
    dialogTitle: '新增单据',
    check: async dialog => {
      // 所属公司按登录人公司带出，空着会导致保存时被后端必填校验拒绝
      await expectSelectChosen(dialog, '所属公司')
    }
  },
  {
    id: 'FA-BORROW',
    title: '固资新增借出单弹窗可正常打开',
    role: 'ROLE_ASSET',
    path: '/fixed-assets?tab=borrow',
    button: /新增单据/,
    dialogTitle: '新增单据',
    check: async dialog => {
      await expectSelectChosen(dialog, '所属公司')
    }
  }
]

let admin: Session
const tempUsers: TempUser[] = []
const principals = new Map<string, Principal>()

test.beforeAll(async () => {
  admin = await loginViaApi()

  const roles = ['ROLE_USER', 'ROLE_LEADER', 'ROLE_WAREHOUSE', 'ROLE_ASSET']
  const api = await apiAs(admin.token)
  try {
    const res = await api.get('/api/org-roles?pageSize=200')
    expect(res.ok(), `读取角色列表失败 HTTP ${res.status()}`).toBeTruthy()
    const all: Array<{ id: string; code: string }> = (await res.json())?.data ?? []

    for (const code of roles) {
      const role = all.find(r => r.code === code)
      if (!role) throw new Error(`生产库缺少种子角色 ${code}`)
      const user = await createTempUser(admin, role.id)
      tempUsers.push(user)
      const session = await loginViaApi({ username: user.username, password: user.password })
      principals.set(code, { code, session, user })
    }
  } finally {
    await api.dispose()
  }
})

test.afterAll(async () => {
  for (const user of tempUsers) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

for (const action of ACTIONS) {
  test(`[P4-22-${action.id}] ${action.title}`, async ({ context, page }, testInfo) => {
    const principal = principals.get(action.role)
    expect(principal, `角色 ${action.role} 未完成初始化`).toBeTruthy()
    if (!principal) return

    const guards = installGuards(page)
    await seedSession(context, principal.session)
    await page.goto(action.path)
    await waitSettled(page)

    await clickVisibleButton(page, action.button)

    const dialog = page.locator('.el-dialog:visible').first()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(action.dialogTitle)
    await action.check(dialog, principal)
    await shot(page, testInfo, 1, action.id)

    await dialog.getByRole('button', { name: '取消' }).first().click()
    await expect(dialog).toBeHidden()

    // 主操作不得出现权限类错误提示（BUG-001 的界面表现就是这条 toast）
    await expect(page.locator('.el-message--error')).toHaveCount(0)

    // 全程 /api/ 不得有未豁免的 4xx/5xx
    guards.assertClean()
  })
}
