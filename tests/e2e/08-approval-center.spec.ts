import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempUser,
  findRoleIdByCode,
  pickOrgUnit,
  type TempUser
} from './fixtures/data'
import { deleteDocQuietly } from './fixtures/fixedAsset'
import { installGuards } from './fixtures/net'

/**
 * P3 审批中心与流程配置。
 *
 * 覆盖：
 * - 工作台「待我审批 / 我发起的 / 我已处理」的归属口径与环节推进；
 * - 工作台弹窗通过、列表驳回（意见必填）对单据状态与轨迹的影响；
 * - 流程配置页的新建、重复编号、环节增删改、启停开关；
 * - 停用流程后新单据不可提交；
 * - 审批轨迹完整性、越权审批拦截；
 * - 审批记录不可篡改（已知缺陷 fixme）。
 *
 * 数据：单据/资产/流程全部 `E2E_` 前缀；afterAll 先单据、轨迹、资产、流程、用户依次清理。
 * 环境：生产形态 http://localhost（生产库）；本文件会临时停用/恢复 `FLOW_DISPATCH`。
 */
type FlowRow = Record<string, any>

let admin: Session
let orgUnits: { companyId: string; deptId: string }
let financeRoleId: string
let dispatchFlowId: string

const assets: string[] = []
const docs: Array<{ key: string; id: string; code: string }> = []
/** 临时流程编码：按编码兜底清理，避免用例中途失败时残留 enabled=true 的模板 */
const flowCodes: string[] = []
const users: TempUser[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  orgUnits = await pickOrgUnit(admin)
  financeRoleId = await findRoleIdByCode(admin, 'ROLE_FINANCE')

  const dispatch = await findFlowByCode('FLOW_DISPATCH')
  if (!dispatch) throw new Error('缺少派发流程 FLOW_DISPATCH，P3 用例依赖该模板')
  dispatchFlowId = String(dispatch.id)
})

test.afterAll(async () => {
  // 安全兜底：任何用例失败都不把派发流程留在停用状态
  await setFlowEnabled(dispatchFlowId, true).catch(() => null)

  await withApi(admin.token, async api => {
    // 审批中的单据先撤销再删，轨迹由后端 afterDelete 级联清理
    for (const doc of docs) {
      await deleteDocQuietly(api, doc.key, doc.id)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
  })

  if (flowCodes.length) {
    await withApi(admin.token, async api => {
      const res = await api.get('/api/system-workflow-flows?pageSize=200')
      if (!res.ok()) return
      const rows = ((await res.json()).data ?? []) as FlowRow[]
      for (const row of rows.filter(r => flowCodes.includes(String(r.code)))) {
        await api.delete(`/api/system-workflow-flows/${row.id}`).catch(() => null)
      }
    }).catch(() => null)
  }
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

// ---------------------------------------------------------------- 基础设施

async function withApi<T>(token: string, fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await apiAs(token)
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

async function json<T = any>(res: any, action: string): Promise<T> {
  const body = await res.json()
  if (!res.ok() || body.code !== 0) {
    throw new Error(`${action} 失败 HTTP ${res.status()} code=${body.code} ${body.message ?? ''}`)
  }
  return body.data as T
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`
}

async function findFlowByCode(code: string): Promise<FlowRow | null> {
  return withApi(admin.token, async api => {
    const rows = await json<FlowRow[]>(await api.get('/api/system-workflow-flows?pageSize=200'), '查询流程配置')
    return rows.find(r => r.code === code) ?? null
  })
}

/** 建临时流程：默认停用，避免 updateTime 最新导致它被 flowOf 当成该业务类型的启用模板 */
async function createFlowApi(overrides: Partial<FlowRow> = {}): Promise<FlowRow> {
  const code = String(overrides.code ?? `E2E_FLOW_${suffix()}`)
  const payload = {
    code,
    name: `E2E_流程_${code}`,
    bizType: 'CHANGE',
    enabled: false,
    steps: [] as FlowRow[],
    ...overrides
  }
  const created = await withApi(admin.token, async api =>
    json<FlowRow>(await api.post('/api/system-workflow-flows', { data: payload }), '创建临时流程')
  )
  flowCodes.push(code)
  return created
}

/** 停用/启用流程（全量 PUT，必须带当前 version 通过乐观锁） */
async function setFlowEnabled(id: string, enabled: boolean): Promise<FlowRow> {
  return withApi(admin.token, async api => {
    const current = await json<FlowRow>(await api.get(`/api/system-workflow-flows/${id}`), '读取流程')
    return json<FlowRow>(
      await api.put(`/api/system-workflow-flows/${id}`, { data: { ...current, enabled } }),
      '更新流程启用状态'
    )
  })
}

async function createAsset(): Promise<{ id: string; code: string }> {
  const code = `E2E_FA_P3_${suffix()}`
  const created = await withApi(admin.token, async api => {
    const res = await api.post('/api/fixed-assets', {
      data: {
        code,
        name: `E2E_资产_${code}`,
        category: 'ELECTRONIC',
        companyId: orgUnits.companyId,
        deptId: orgUnits.deptId || undefined,
        userId: admin.user.id,
        location: 'E2E_位置',
        purchaseDate: '2026-01-15',
        inboundDate: '2026-01-16',
        amount: 1000,
        original: 1000,
        net: 1000,
        status: 'IDLE',
        depreciate: false,
        purchaseMode: 'PURCHASE'
      }
    })
    return json<{ id: string }>(res, '创建资产')
  })
  assets.push(created.id)
  return { id: created.id, code }
}

async function createDoc(
  bizKey: string,
  options: { assetId: string; code?: string }
): Promise<{ id: string; code: string }> {
  const code = options.code ?? `E2E_DOC_P3_${suffix()}`
  const created = await withApi(admin.token, async api => {
    const res = await api.post(`/api/fixed-asset-doc-lists-${bizKey}`, {
      data: {
        code,
        name: `E2E_单据_${code}`,
        companyId: orgUnits.companyId,
        assetId: options.assetId,
        creatorId: admin.user.id,
        createTime: new Date().toISOString(),
        finishTime: '',
        remark: 'E2E 自动创建，用后删除',
        status: 'DRAFT'
      }
    })
    return json<{ id: string }>(res, '创建单据')
  })
  docs.push({ key: bizKey, id: created.id, code })
  return { id: created.id, code }
}

async function docStatus(bizKey: string, id: string): Promise<string> {
  return withApi(admin.token, async api => {
    const row = await json<FlowRow>(await api.get(`/api/fixed-asset-doc-lists-${bizKey}/${id}`), '读取单据')
    return String(row.status)
  })
}

async function act(
  token: string,
  payload: { docKey: string; docId: string; action: string; comment?: string; ctx?: Record<string, unknown> }
) {
  return withApi(token, async api => {
    const res = await api.post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, ...payload }
    })
    return { status: res.status(), body: await res.json() }
  })
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

async function createRoleUser(roleCode: string): Promise<{ user: TempUser; session: Session }> {
  const roleId = await findRoleIdByCode(admin, roleCode)
  const user = await createTempUser(admin, roleId)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, session }
}

/** 派发流程第一环节（使用部门确认）的审批账号 */
function createLeaderUser() {
  return createRoleUser('ROLE_LEADER')
}

// ---------------------------------------------------------------- 工作台 UI

async function openWorkbench(page: Page): Promise<void> {
  await page.goto('/workbench')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  // 等聚合数据算完：待办面板要么出表格，要么出空态
  await expect(page.locator('.wb-todo .el-table, .wb-todo .wb-todo-empty').first()).toBeVisible()
}

function activePane(page: Page) {
  return page.locator('.wb-todo .el-tab-pane:visible')
}

async function switchTodoTab(page: Page, label: string): Promise<void> {
  await page.locator('.wb-todo .el-tabs__item').filter({ hasText: label }).click()
  await page.waitForTimeout(200)
}

function todoRow(page: Page, code: string) {
  return activePane(page).locator('.el-table__row').filter({ hasText: code }).first()
}

async function lastMessage(page: Page) {
  return page.locator('.el-message').last()
}

/** 提交单据并推进到第二环节（资产管理员登记），返回单据与审批人 */
async function docAtAssetStep() {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()
  const submitted = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.status).toBe(200)
  const first = await act(leader.session.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 部门确认通过'
  })
  expect(first.status).toBe(200)
  expect(first.body.data.status).toBe('PROCESSING')
  return { doc, leader }
}

// ---------------------------------------------------------------- 待办归属

test('[P3-01] 待我审批只显示当前环节本人角色可审的单据', async ({ context, page }, testInfo) => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()

  const submitted = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.body.data.status).toBe('PROCESSING')

  const guards = installGuards(page)
  await seedSession(context, admin)

  // 第一环节要求「部门主管」，admin 只有系统管理员 / 资产管理员，不应出现在待办里
  await openWorkbench(page)
  await expect(todoRow(page, doc.code)).toHaveCount(0)
  await shot(page, testInfo, 1, '第一环节非本人角色时无待办')

  // 部门主管通过后，第二环节（资产管理员登记）轮到 admin
  const approved = await act(leader.session.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 部门确认通过'
  })
  expect(approved.body.data.status).toBe('PROCESSING')

  await page.reload()
  await waitSettled(page)
  const row = todoRow(page, doc.code)
  await expect(row).toBeVisible()
  await expect(row).toContainText('资产管理员登记')
  await shot(page, testInfo, 2, '环节推进后出现在本人待办')
  guards.assertClean()
})

test('[P3-02] 我发起的显示单据状态与当前环节', async ({ context, page }, testInfo) => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const submitted = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.body.data.status).toBe('PROCESSING')

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)
  await switchTodoTab(page, '我发起的')

  const row = todoRow(page, doc.code)
  await expect(row).toBeVisible()
  await expect(row).toContainText('进行中')
  await expect(row).toContainText('使用部门确认')
  await shot(page, testInfo, 1, '我发起的显示进行中与当前环节')
  guards.assertClean()
})

test('[P3-03] 我已处理显示本人结论、意见与时间', async ({ context, page }, testInfo) => {
  const { doc } = await docAtAssetStep()
  const approved = await act(admin.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 资产管理员登记完成'
  })
  expect(approved.body.data.status).toBe('DONE')

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)
  await switchTodoTab(page, '我已处理')

  const row = todoRow(page, doc.code)
  await expect(row).toBeVisible()
  await expect(row).toContainText('通过')
  await expect(row).toContainText('E2E 资产管理员登记完成')
  // 处理时间形如 2026-10-30 15:45:30
  await expect(row).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await shot(page, testInfo, 1, '我已处理含结论意见时间')
  guards.assertClean()
})

// ---------------------------------------------------------------- 审批动作 UI

test('[P3-04] 工作台通过后单据完结且待办消失', async ({ context, page }, testInfo) => {
  const { doc } = await docAtAssetStep()
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  const row = todoRow(page, doc.code)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '通过' }).click()

  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('资产管理员登记')
  await dialog.locator('textarea').fill('E2E 界面通过意见')
  await shot(page, testInfo, 1, '待办弹窗点击通过')

  await dialog.getByRole('button', { name: '通过' }).click()
  await expect(await lastMessage(page)).toContainText(/审批已全部通过/)
  expect(await docStatus('alloc', doc.id)).toBe('DONE')

  await expect(todoRow(page, doc.code)).toHaveCount(0)
  await shot(page, testInfo, 2, '完结后待办消失')
  guards.assertClean()
})

test('[P3-05] 工作台驳回必须填意见且状态回退', async ({ context, page }, testInfo) => {
  const { doc } = await docAtAssetStep()
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  await todoRow(page, doc.code).getByRole('button', { name: '驳回' }).click()
  const box = page.locator('.el-message-box:visible')
  await expect(box).toContainText('驳回审批')

  // 空意见：前端校验拦下，不发起请求
  await box.getByRole('button', { name: '确定' }).click()
  await expect(box.locator('.el-message-box__errormsg')).toContainText('驳回必须填写意见')
  await shot(page, testInfo, 1, '空意见被校验拦下')

  await box.locator('input').fill('E2E 界面驳回意见')
  await box.getByRole('button', { name: '确定' }).click()
  await expect(await lastMessage(page)).toContainText(/已驳回/)
  expect(await docStatus('alloc', doc.id)).toBe('REJECTED')

  await switchTodoTab(page, '我发起的')
  await expect(todoRow(page, doc.code)).toContainText('已驳回')
  await shot(page, testInfo, 2, '驳回后我发起的显示已驳回')
  guards.assertClean()
})

// ---------------------------------------------------------------- 流程配置 UI

test('[P3-06] 流程配置页新建流程并持久化', async ({ context, page }, testInfo) => {
  const code = `E2E_FLOW_UI_${suffix()}`
  const name = `E2E_界面流程_${code}`
  // 先登记编码：即使后续断言失败，afterAll 也能按编码兜底删除
  flowCodes.push(code)
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/system/workflow')
  await waitSettled(page)

  await page.getByRole('button', { name: '新建流程' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新建流程' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '流程名称' }).locator('input').first().fill(name)
  await dialog.locator('.el-form-item').filter({ hasText: '业务类型' }).locator('.el-select').click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '变更' }).first().click()
  await dialog.locator('.el-form-item').filter({ hasText: '流程编号' }).locator('input').first().fill(code)
  await shot(page, testInfo, 1, '新建流程表单')

  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(await lastMessage(page)).toContainText(/流程已创建/)

  const created = await findFlowByCode(code)
  expect(created, '接口应能查到新建流程').toBeTruthy()
  expect(created!.bizType).toBe('CHANGE')
  expect(created!.steps ?? []).toEqual([])
  // 立即停用：新流程 updateTime 最新会被列表排在最前，避免影响其他业务类型的模板匹配
  await setFlowEnabled(String(created!.id), false)

  // 关键字筛选能唯一定位到新建流程
  await page.getByPlaceholder('流程名称/编号').fill(code)
  await page.waitForTimeout(200)
  await expect(page.locator('.flow-item')).toHaveCount(1)
  await expect(page.locator('.flow-item')).toContainText(name)
  await shot(page, testInfo, 2, '新建流程出现在列表')
  guards.assertClean()
})

test('[P3-07] 流程编号重复被拒绝且提示明确', async ({ context, page }, testInfo) => {
  const flow = await createFlowApi({ code: `E2E_FLOW_DUP_${suffix()}` })
  // 本用例故意触发 409，只放行「新建流程」这一个请求，其余接口错误仍判红
  const guards = installGuards(page, {
    allowRequests: [{ method: 'POST', url: /\/api\/system-workflow-flows$/, status: [409], reason: '流程编号重复是预期结果' }]
  })
  await seedSession(context, admin)
  await page.goto('/system/workflow')
  await waitSettled(page)

  await page.getByRole('button', { name: '新建流程' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新建流程' }).last()
  await dialog.locator('.el-form-item').filter({ hasText: '流程名称' }).locator('input').first().fill('E2E_重复编号流程')
  await dialog.locator('.el-form-item').filter({ hasText: '流程编号' }).locator('input').first().fill(String(flow.code))
  await dialog.getByRole('button', { name: '保存' }).click()

  const message = page.locator('.el-message--error').last()
  await expect(message).toContainText(/已存在|重复/)
  await expect(dialog).toBeVisible()
  await shot(page, testInfo, 1, '重复编号错误提示')
  await dialog.getByRole('button', { name: '取消' }).click()

  // 后端只保留原记录，没有因重复提交多出一条
  const rows = await withApi(admin.token, async api =>
    json<FlowRow[]>(await api.get('/api/system-workflow-flows?pageSize=200'), '查询流程配置')
  )
  expect(rows.filter(r => r.code === flow.code)).toHaveLength(1)
  guards.assertClean()
})

test('[P3-08] 流程配置添加审批环节并持久化', async ({ context, page }, testInfo) => {
  const flow = await createFlowApi({ code: `E2E_FLOW_STEP_${suffix()}` })
  const stepName = `E2E_环节_${suffix()}`
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/system/workflow')
  await waitSettled(page)
  await page.getByPlaceholder('流程名称/编号').fill(String(flow.code))
  await page.waitForTimeout(200)

  await page.locator('.flow-item').filter({ hasText: String(flow.code) }).click()
  await page.getByRole('button', { name: '添加环节' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑审批环节' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '环节名称' }).locator('input').first().fill(stepName)
  await dialog.locator('.el-form-item').filter({ hasText: '审批角色' }).locator('.el-select').click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '财务管理员' }).first().click()
  await shot(page, testInfo, 1, '填写环节与审批角色')

  await dialog.getByRole('button', { name: '保存环节' }).click()
  await expect(await lastMessage(page)).toContainText(/环节已保存/)

  const saved = await findFlowByCode(String(flow.code))
  const steps = (saved?.steps ?? []) as FlowRow[]
  expect(steps).toHaveLength(1)
  expect(steps[0].name).toBe(stepName)
  expect(steps[0].approverRoleId).toBe(financeRoleId)
  expect(steps[0].mode).toBe('ANY')
  expect(steps[0].conditionType).toBe('NONE')
  await shot(page, testInfo, 2, '环节出现在流程设计器')
  guards.assertClean()
})

test('[P3-09] 流程环节可编辑名称并可删除', async ({ context, page }, testInfo) => {
  const flow = await createFlowApi({
    code: `E2E_FLOW_EDIT_${suffix()}`,
    steps: [
      {
        key: 's1',
        name: 'E2E_原环节',
        approverRoleId: financeRoleId,
        mode: 'ANY',
        conditionType: 'NONE',
        conditionValue: 0
      }
    ]
  })
  const renamed = `E2E_改后环节_${suffix()}`
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/system/workflow')
  await waitSettled(page)
  await page.getByPlaceholder('流程名称/编号').fill(String(flow.code))
  await page.waitForTimeout(200)
  await page.locator('.flow-item').filter({ hasText: String(flow.code) }).click()

  // 点节点进入编辑
  await page.locator('.designer .node-box').filter({ hasText: 'E2E_原环节' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑审批环节' }).last()
  const nameInput = dialog.locator('.el-form-item').filter({ hasText: '环节名称' }).locator('input').first()
  await expect(nameInput).toHaveValue('E2E_原环节')
  await nameInput.fill(renamed)
  await dialog.getByRole('button', { name: '保存环节' }).click()
  await expect(await lastMessage(page)).toContainText(/环节已保存/)
  await expect(page.locator('.designer')).toContainText(renamed)

  let saved = await findFlowByCode(String(flow.code))
  expect((saved?.steps ?? [])[0]?.name).toBe(renamed)
  await shot(page, testInfo, 1, '环节改名后设计器即时更新')

  // 删除环节：确认框 → 接口 steps 归零（仍应使用改名后的最新 version，见 P3-D4）
  await page.locator('.designer .node-ops').first().getByRole('button', { name: '删' }).click()
  const box = page.locator('.el-message-box:visible')
  await box.getByRole('button', { name: '确定' }).click()
  await expect(await lastMessage(page)).toContainText(/已删除/)
  saved = await findFlowByCode(String(flow.code))
  expect(saved?.steps ?? []).toEqual([])
  await shot(page, testInfo, 2, '删除环节后流程为空')
  guards.assertClean()
})

test('[P3-10] 流程启停开关持久化', async ({ context, page }, testInfo) => {
  const flow = await createFlowApi({ code: `E2E_FLOW_TOGGLE_${suffix()}`, enabled: false })
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/system/workflow')
  await waitSettled(page)
  await page.getByPlaceholder('流程名称/编号').fill(String(flow.code))
  await page.waitForTimeout(200)

  const item = page.locator('.flow-item').filter({ hasText: String(flow.code) })
  const toggle = item.locator('.el-switch')
  await expect(toggle).not.toHaveClass(/is-checked/)

  await toggle.click()
  await expect(await lastMessage(page)).toContainText(/已启用/)
  // 提示先于 PUT 落库，轮询到服务端生效再断言
  await expect.poll(async () => (await findFlowByCode(String(flow.code)))?.enabled).toBe(true)
  await shot(page, testInfo, 1, '启用后开关为开')

  await toggle.click()
  await expect(await lastMessage(page)).toContainText(/已停用/)
  await expect.poll(async () => (await findFlowByCode(String(flow.code)))?.enabled).toBe(false)
  guards.assertClean()
})

// ---------------------------------------------------------------- 流程匹配与轨迹

test('[P3-11] 停用流程后该业务类型的新单据不能提交', async () => {
  const original = await findFlowByCode('FLOW_DISPATCH')
  expect(original).toBeTruthy()

  try {
    await setFlowEnabled(dispatchFlowId, false)
    const asset = await createAsset()
    const doc = await createDoc('alloc', { assetId: asset.id })
    const res = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
    expect(res.body.message).toContain('没有启用的审批流程')
    expect(await docStatus('alloc', doc.id)).toBe('DRAFT')
  } finally {
    await setFlowEnabled(dispatchFlowId, true)
  }

  expect((await findFlowByCode('FLOW_DISPATCH'))?.enabled).toBe(true)
})

test('[P3-12] 审批轨迹完整且环节/审批人/意见齐全', async () => {
  const { doc, leader } = await docAtAssetStep()
  const approved = await act(admin.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 登记完成'
  })
  expect(approved.body.data.status).toBe('DONE')

  const trails = await trailsOf(doc.id, doc.code)
  expect(trails).toHaveLength(3)
  expect(trails.map(t => t.result)).toEqual(['SUBMIT', 'AGREE', 'AGREE'])

  for (const t of trails) {
    expect(t.docKey).toBe('alloc')
    expect(t.docId).toBe(doc.id)
    expect(t.docCode).toBe(doc.code)
    expect(t.bizType).toBe('DISPATCH')
    expect(t.flowCode).toBe('FLOW_DISPATCH')
    expect(String(t.approverId || '')).not.toBe('')
    expect(String(t.approverName || '')).not.toBe('')
    expect(String(t.time || '')).not.toBe('')
    expect(Number.isFinite(new Date(String(t.time)).getTime())).toBe(true)
  }

  const [submit, first, second] = trails
  expect(submit.approverId).toBe(admin.user.id)
  expect(submit.stepName ?? '').toBe('')

  expect(first.approverId).toBe(leader.user.id)
  expect(first.approverName).toBe(leader.user.name)
  expect(first.stepName).toBe('使用部门确认')
  expect(first.approverRoleName).toBe('部门主管')
  expect(first.comment).toBe('E2E 部门确认通过')

  expect(second.approverId).toBe(admin.user.id)
  expect(second.stepName).toBe('资产管理员登记')
  expect(second.comment).toBe('E2E 登记完成')
})

test('[P3-13] 非当前环节角色审批被拒且不产生轨迹', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const normal = await createRoleUser('ROLE_USER')
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const res = await act(normal.session.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 越权尝试'
  })
  expect(res.status).toBe(403)
  expect(res.body.message).toContain('使用部门确认')
  expect(res.body.message).toContain('部门主管')

  expect(await docStatus('alloc', doc.id)).toBe('PROCESSING')
  const trails = await trailsOf(doc.id, doc.code)
  expect(trails).toHaveLength(1)
  expect(trails[0].result).toBe('SUBMIT')
})

/**
 * P3-D1（2026-11-02 修复）：`org-users` / `system-workflow` 的读权限额外允许 `wm:todo`，
 * 审批角色可自行算出待办；写配置仍只允许 org:user / sys:workflow。
 */
test('[P3-14] 仅有审批权限的角色打开工作台应能看到本人待办', async ({ context, page }, testInfo) => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  // 根因先行：审批角色必须能读到流程与用户，否则待办无从计算
  await withApi(leader.session.token, async api => {
    expect((await api.get('/api/system-workflow-flows?pageSize=10')).status()).toBe(200)
    expect((await api.get('/api/org-users?pageSize=10')).status()).toBe(200)
  })

  // 2026-11-02 起：工作台按权限懒加载，审批角色不再预取无权面板，无需豁免 403
  const guards = installGuards(page)
  await seedSession(context, leader.session)
  await openWorkbench(page)

  const row = todoRow(page, doc.code)
  await expect(row).toBeVisible()
  await expect(row).toContainText('使用部门确认')
  await shot(page, testInfo, 1, '部门主管工作台待办')
  expect(guards.pageErrors, '工作台不应因待办数据源失败抛未捕获异常').toEqual([])
})

/**
 * P3-D2（2026-11-02 修复）：`fixed-asset-doc-approvals` 登记为只读集合，
 * 通用 CRUD 的 PUT/DELETE 一律 403；轨迹只能由 ApprovalTrailWriter 服务端内部写入。
 */
test('[P3-15] 审批记录应不可篡改与删除', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const trail = (await trailsOf(doc.id, doc.code))[0]
  await withApi(admin.token, async api => {
    const put = await api.put(`/api/fixed-asset-doc-approvals/${trail.id}`, {
      data: { ...trail, comment: 'TAMPERED' }
    })
    expect([403, 405, 409]).toContain(put.status())

    const del = await api.delete(`/api/fixed-asset-doc-approvals/${trail.id}`)
    expect([403, 405, 409]).toContain(del.status())
  })

  const after = await trailsOf(doc.id, doc.code)
  expect(after).toHaveLength(1)
  expect(after[0].comment).not.toBe('TAMPERED')
})
