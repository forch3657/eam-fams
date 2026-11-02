import { expect, test, type Page } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempUser,
  findRoleIdByCode,
  pickOrgUnit,
  type TempUser
} from './fixtures/data'
import {
  act,
  createAsset,
  createDoc,
  deleteDocQuietly,
  docStatus,
  json,
  withApi
} from './fixtures/fixedAsset'
import { installGuards } from './fixtures/net'

/**
 * P6 审批协作：加签 / 转办 / 抄送。
 *
 * 覆盖 DocApprovalDialog 新增的三个按钮：
 * - 加签：目标人追加进当前环节审批人集合，原审批人仍可通过；
 * - 转办：目标人替换当前环节审批人，原审批人待办消失、目标人可通过；
 * - 抄送：创建人也能发起，只留痕、不推进状态；
 * - 候选人员：排除自己与当前环节已有审批人。
 *
 * 数据：资产/单据/临时用户全部 E2E_ 前缀，afterAll 先单据后用户清理。
 * 环境：生产形态 http://localhost（生产库），只跑 admin 与临时 ROLE_LEADER 账号。
 */
type FlowRow = Record<string, any>
type DocRef = { key: string; id: string; code: string }

let admin: Session
let units: { companyId: string; deptId: string }

const assets: string[] = []
const docs: DocRef[] = []
const users: TempUser[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  units = await pickOrgUnit(admin)
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    for (const doc of docs) {
      await deleteDocQuietly(api, doc.key, doc.id)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
  })
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

// ---------------------------------------------------------------- 数据准备

async function createLeader(): Promise<{ user: TempUser; session: Session }> {
  const roleId = await findRoleIdByCode(admin, 'ROLE_LEADER')
  const user = await createTempUser(admin, roleId)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, session }
}

/**
 * 造一张停在「资产管理员登记」环节的派发单：
 * 第一环节（部门主管）由临时账号通过，第二环节轮到 admin。
 */
async function docAtAssetStep(): Promise<{ doc: DocRef; leader: { user: TempUser; session: Session } }> {
  const asset = await createAsset(admin, units)
  assets.push(asset.id)
  const doc = await createDoc(admin, units, 'alloc', { assetId: asset.id })
  docs.push({ key: 'alloc', id: doc.id, code: doc.code })
  const leader = await createLeader()

  const submitted = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
  const first = await act(leader.session.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 部门确认通过'
  })
  expect(first.status, JSON.stringify(first.body)).toBe(200)
  expect(first.body.data.status).toBe('PROCESSING')
  return { doc, leader }
}

async function trailsOf(docId: string, docCode: string): Promise<FlowRow[]> {
  return withApi(admin.token, async api => {
    const rows = await json<FlowRow[]>(
      await api.get(`/api/fixed-asset-doc-approvals?pageSize=200&keyword=${encodeURIComponent(docCode)}`),
      '读取审批轨迹'
    )
    return rows
      .filter(r => r.docId === docId)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
  })
}

// ---------------------------------------------------------------- UI 辅助

async function openWorkbench(page: Page, session: Session = admin): Promise<void> {
  await seedSession(page.context(), session)
  await page.goto('/workbench')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  await expect(page.locator('.wb-todo .el-table, .wb-todo .wb-todo-empty').first()).toBeVisible()
}

function todoRow(page: Page, code: string) {
  return page.locator('.wb-todo .el-tab-pane:visible .el-table__row').filter({ hasText: code }).first()
}

async function openApprovalDialog(page: Page, code: string) {
  await todoRow(page, code).getByRole('button', { name: '通过' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
  await expect(dialog).toBeVisible()
  return dialog
}

function collabDialog(page: Page) {
  return page.locator('.el-dialog:visible').filter({ hasText: '目标人员' }).last()
}

/** 点开协作按钮、选人、填说明并确认；返回目标弹窗定位器 */
async function submitCollab(
  page: Page,
  mainDialog: ReturnType<typeof collabDialog>,
  action: '加签' | '转办' | '抄送',
  target: { username: string; name: string },
  comment: string
) {
  await mainDialog.getByRole('button', { name: action, exact: true }).click()
  const box = collabDialog(page)
  await expect(box).toBeVisible()
  await box.locator('.el-select').click()
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await options.filter({ hasText: target.username }).first().click()
  await box.locator('textarea').fill(comment)
  await box.getByRole('button', { name: '确定' }).click()
  await expect(box).toBeHidden()
}

// ---------------------------------------------------------------- 用例

test('[P6-01] 加签：追加审批人且候选排除自己与当前审批人', async ({ page }, testInfo) => {
  const { doc, leader } = await docAtAssetStep()
  const guards = installGuards(page)
  await openWorkbench(page)
  const dialog = await openApprovalDialog(page, doc.code)
  await expect(dialog.getByRole('button', { name: '加签', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '转办', exact: true })).toBeVisible()
  await shot(page, testInfo, 1, '审批弹窗出现加签转办抄送')

  // 候选：排除自己；上一环节审批人可被加签
  await dialog.getByRole('button', { name: '加签', exact: true }).click()
  const box = collabDialog(page)
  await expect(box).toBeVisible()
  await box.locator('.el-select').click()
  const options = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
  await expect(options.filter({ hasText: admin.user.username })).toHaveCount(0)
  await expect(options.filter({ hasText: leader.user.username })).toHaveCount(1)
  await shot(page, testInfo, 2, '加签候选人员下拉')
  await options.filter({ hasText: leader.user.username }).first().click()
  await box.locator('textarea').fill('E2E 加签说明')
  await shot(page, testInfo, 3, '填写加签目标与说明')
  await box.getByRole('button', { name: '确定' }).click()

  await expect(page.locator('.el-message').last()).toContainText(`已加签给「${leader.user.name}」`)
  // 协作动作不推进单据，弹窗保持打开并刷新轨迹
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.el-timeline')).toContainText('加签')
  await expect(dialog.locator('.el-timeline')).toContainText(leader.user.name)
  await expect(dialog.locator('.el-timeline')).toContainText('E2E 加签说明')

  const trails = await trailsOf(doc.id, doc.code)
  const addSign = trails.find(t => t.result === 'ADD_SIGN')
  expect(addSign, '应写入加签轨迹').toBeTruthy()
  expect(addSign!.targetUserId).toBe(leader.user.id)
  expect(addSign!.approverId).toBe(admin.user.id)
  expect(await docStatus(admin, 'alloc', doc.id)).toBe('PROCESSING')
  await shot(page, testInfo, 4, '加签后轨迹与状态不变')
  guards.assertClean()
})

test('[P6-02] 转办：审批人变更且目标人可完成审批', async ({ page, browser }, testInfo) => {
  const { doc, leader } = await docAtAssetStep()
  const guards = installGuards(page)
  await openWorkbench(page)
  const dialog = await openApprovalDialog(page, doc.code)
  await submitCollab(page, dialog, '转办', leader.user, 'E2E 转办说明')

  await expect(page.locator('.el-message').last()).toContainText(`已转办给「${leader.user.name}」`)
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.el-timeline')).toContainText('转办')
  await expect(dialog.locator('.el-timeline')).toContainText(leader.user.name)
  // 提示条改为「由目标人审批」
  await expect(dialog).toContainText(leader.user.username)
  await shot(page, testInfo, 1, '转办后当前环节审批人已变更')

  const trails = await trailsOf(doc.id, doc.code)
  const transfer = trails.find(t => t.result === 'TRANSFER')
  expect(transfer, '应写入转办轨迹').toBeTruthy()
  expect(transfer!.targetUserId).toBe(leader.user.id)
  expect(await docStatus(admin, 'alloc', doc.id)).toBe('PROCESSING')

  // 原审批人待办消失
  await page.reload()
  await waitSettled(page)
  await expect(todoRow(page, doc.code)).toHaveCount(0)
  await shot(page, testInfo, 2, '原审批人待办消失')

  // 目标人登录后可见待办并通过
  const ctx = await browser.newContext()
  const targetPage = await ctx.newPage()
  // 审批角色没有日志/消息/模板的读权限，工作台这些面板 403 与待办无关
  const targetGuards = installGuards(targetPage, {
    allowStatus: [403],
    allowConsole: [/无权限访问该数据：(operation-logs|notify-messages|notify-templates)/],
    allowPageError: [/无权限访问该数据：(operation-logs|notify-messages|notify-templates)/]
  })
  try {
    await openWorkbench(targetPage, leader.session)
    await expect(todoRow(targetPage, doc.code)).toBeVisible()
    await shot(targetPage, testInfo, 3, '目标人工作台出现待办')
    const targetDialog = await openApprovalDialog(targetPage, doc.code)
    await targetDialog.getByRole('button', { name: '通过' }).click()
    await expect(targetPage.locator('.el-message').last()).toContainText(/审批已全部通过/)
    expect(await docStatus(admin, 'alloc', doc.id)).toBe('DONE')
    await shot(targetPage, testInfo, 4, '目标人通过后单据完结')
    targetGuards.assertClean()
  } finally {
    await ctx.close()
  }
  guards.assertClean()
})

test('[P6-03] 抄送：创建人可发起且只留痕不推进状态', async ({ page }, testInfo) => {
  const asset = await createAsset(admin, units)
  assets.push(asset.id)
  const doc = await createDoc(admin, units, 'alloc', { assetId: asset.id })
  docs.push({ key: 'alloc', id: doc.id, code: doc.code })
  const leader = await createLeader()
  const submitted = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)

  const guards = installGuards(page)
  await seedSession(page.context(), admin)
  await page.goto('/fixed-assets?tab=dispatch&sub=alloc')
  await waitSettled(page)
  // 页面同时挂载了多个单据列表，只操作当前可见的派发单列表
  const list = page.locator('.doc-list:visible').first()
  await list.getByPlaceholder('请输入单据编号').fill(doc.code)
  await list.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(300)

  const row = list.locator('.el-table__row').filter({ hasText: doc.code }).first()
  await expect(row).toBeVisible()
  await row.locator('a.el-link').first().click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
  await expect(dialog).toBeVisible()

  // 创建人但不是当前环节审批人：只能抄送，不能加签/转办
  await expect(dialog.getByRole('button', { name: '抄送', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '加签', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '转办', exact: true })).toHaveCount(0)
  await shot(page, testInfo, 1, '创建人仅可见抄送')

  await submitCollab(page, dialog, '抄送', leader.user, 'E2E 抄送说明')
  await expect(page.locator('.el-message').last()).toContainText(`已抄送给「${leader.user.name}」`)
  await expect(dialog.locator('.el-timeline')).toContainText('抄送')
  await expect(dialog.locator('.el-timeline')).toContainText(leader.user.name)

  const trails = await trailsOf(doc.id, doc.code)
  const cc = trails.find(t => t.result === 'CC')
  expect(cc, '应写入抄送轨迹').toBeTruthy()
  expect(cc!.targetUserId).toBe(leader.user.id)
  expect(await docStatus(admin, 'alloc', doc.id)).toBe('PROCESSING')
  // 仍停在第一环节，没有因为抄送推进
  await expect(dialog).toContainText('使用部门确认')
  await shot(page, testInfo, 2, '抄送后仍停原环节')
  guards.assertClean()
})
