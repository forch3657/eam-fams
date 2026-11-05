import { expect, test } from '@playwright/test'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { apiList, apiPost, withApi } from './fixtures/p5'
import { REAL_ORG_DEPTS } from './fixtures/realOrg'

/**
 * 审批动作「点了没反应」专项回归（2026-11-05，用户手工反馈）。
 *
 * 复现路径：陈学知（R3）新增低值领用 → 前端自动提交成功（库里已是 PROCESSING），
 * 但列表行仍是草稿快照，继续显示「提交」按钮 → 再点一次被后端 409 拒绝；
 * 而 runApproval 把 ApiError 直接抛出、调用点没有 catch，界面毫无反馈。
 *
 * 既有 P2-23 只断言「新增领用成功提示 + 轨迹」，P2-24 只断言「草稿提交成功」，
 * 都没断言列表行按钮状态，也没覆盖审批失败时的界面反馈，所以全量回归发现不了。
 * 本专项一律用真人账号 + 真实点击，覆盖：表格行提交成功、审批失败可见、自动提交后状态同步。
 */

let chen: Session
let item: Record<string, any>
const created: string[] = []
const DEPT_ID = REAL_ORG_DEPTS.find(d => d.deptName === '产品研发一部')!.deptId

test.beforeAll(async () => {
  const actor = REAL_ORG_DEPTS.find(d => d.deptName === '产品研发一部')!.actors.user
  chen = await loginViaApi({ username: actor.username, password: actor.password })
  const items = await apiList(chen, 'low-value-items')
  item = items.find(i => Number(i.stock) > 2)
  expect(item, '需要一件有可用库存的低值物品').toBeTruthy()
})

test.afterAll(async () => {
  // 只删本轮新建的单据；处理中的先撤销再删，避免预占库存残留。真实账号一律不动。
  for (const id of created) {
    await withApi(chen, async api => {
      await api.post('/api/approvals/action', {
        data: { docKey: 'requisition', docId: id, bizType: 'REQUISITION', action: 'revoke', comment: 'E2E 清理' }
      }).catch(() => null)
      await api.delete(`/api/low-value-requisition/${id}`).catch(() => null)
    })
  }
})

async function createDraft(tag: string) {
  const docNo = `E2E_AF_${Date.now()}_${tag}`
  const row = await apiPost(chen, 'low-value-requisition', {
    docNo, itemId: item.id, itemName: item.name, quantity: 1,
    price: item.price, amount: item.price,
    receiver: chen.user.name, deptId: DEPT_ID,
    requisitionDate: '2026-11-05', operator: 'E2E', remark: 'E2E_AF 审批反馈回归',
    status: 'DRAFT', creatorId: chen.user.id, submitTime: '', settleTime: ''
  })
  created.push(String(row.id))
  return { id: String(row.id), docNo }
}

test('[AF-01] 表格行「提交」成功：提示可见、行内按钮刷新、后端状态推进', async ({ context, page }) => {
  const draft = await createDraft('ok')
  await seedSession(context, chen)
  await page.goto('/low-value-assets?tab=requisition')

  const row = page.locator('.el-table__row').filter({ hasText: draft.docNo }).first()
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: '提交', exact: true })).toBeVisible()

  await row.getByRole('button', { name: '提交', exact: true }).click()
  await expect(page.locator('.el-message--success').last()).toContainText('已提交审批')
  await expect(row.getByRole('button', { name: '提交', exact: true }), '提交后按钮应消失').toHaveCount(0)
  await expect(row.getByRole('button', { name: '撤销' })).toBeVisible()

  const detail = await withApi(chen, async api => (await api.get(`/api/low-value-requisition/${draft.id}`)).json())
  expect(detail.data.status, '后端状态应推进到审批中').toBe('PROCESSING')
})

test('[AF-02] 后端拒绝提交时界面必须给出可见错误，而不是毫无反应', async ({ context, page }) => {
  const draft = await createDraft('fail')
  // 只拦截审批动作、不落任何后端副作用：模拟「同一单据二次提交」被 409 拒绝
  await page.route('**/api/approvals/action', route => route.fulfill({
    status: 409,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ code: 409, message: '只有草稿或已驳回的单据可以提交审批' })
  }))
  await seedSession(context, chen)
  await page.goto('/low-value-assets?tab=requisition')

  const row = page.locator('.el-table__row').filter({ hasText: draft.docNo }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '提交', exact: true }).click()

  await expect(
    page.locator('.el-message--error').filter({ hasText: '只有草稿或已驳回的单据可以提交审批' }),
    '审批失败必须弹给用户看，不能是未捕获异常导致的静默'
  ).toBeVisible()
})

test('[AF-03] 新增领用自动提交后，列表不再残留草稿态「提交」按钮', async ({ context, page }) => {
  await seedSession(context, chen)
  await page.goto('/low-value-assets?tab=requisition')

  await page.getByRole('button', { name: '新增领用' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增领用' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '领用物品' }).locator('.el-select').click()
  const option = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: item.name }).first()
  await expect(option).toBeVisible()
  await option.click()
  const qty = dialog.locator('.el-input-number input').first()
  await qty.fill('1')
  await qty.blur()

  const resPromise = page.waitForResponse(
    r => r.url().includes('/api/low-value-requisition') && r.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: '确定' }).click()
  const body = await (await resPromise).json()
  expect(body.code, `新增领用失败 ${body.message || ''}`).toBe(0)
  created.push(String(body.data.id))
  const docNo = String(body.data.docNo)

  await expect(page.locator('.el-message--success').filter({ hasText: '领用单已提交审批' })).toBeVisible()
  const row = page.locator('.el-table__row').filter({ hasText: docNo }).first()
  await expect(row).toBeVisible()
  await expect(row.getByRole('button', { name: '提交', exact: true }),
    '自动提交成功后不应再显示提交按钮（否则用户会重复点击并收到 409）').toHaveCount(0)
  await expect(row.getByRole('button', { name: '撤销' })).toBeVisible()
})

test('[AF-04] 撤销后再新增领用，已撤销单据不得被改回「进行中」', async ({ context, page }) => {
  const a = await createDraft('rev')
  await seedSession(context, chen)
  await page.goto('/low-value-assets?tab=requisition')

  const rowA = page.locator('.el-table__row').filter({ hasText: a.docNo }).first()
  await expect(rowA).toBeVisible()
  await rowA.getByRole('button', { name: '提交', exact: true }).click()
  await expect(rowA.getByRole('button', { name: '撤销' })).toBeVisible()

  await rowA.getByRole('button', { name: '撤销' }).click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await expect(rowA.locator('.el-tag').filter({ hasText: '已撤销' }), '撤销后该行应显示已撤销').toBeVisible()

  // 再走界面新增一张领用（会自动提交），观察已撤销的旧行是否被连带改状态
  await page.getByRole('button', { name: '新增领用' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增领用' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '领用物品' }).locator('.el-select').click()
  const option = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: item.name }).first()
  await expect(option).toBeVisible()
  await option.click()
  const qty = dialog.locator('.el-input-number input').first()
  await qty.fill('1')
  await qty.blur()
  const resPromise = page.waitForResponse(
    r => r.url().includes('/api/low-value-requisition') && r.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: '确定' }).click()
  const body = await (await resPromise).json()
  expect(body.code, `新增领用失败 ${body.message || ''}`).toBe(0)
  created.push(String(body.data.id))

  const detailA = await withApi(chen, async api => (await api.get(`/api/low-value-requisition/${a.id}`)).json())
  expect(detailA.data.status, '后端也必须是 REVOKED').toBe('REVOKED')
  await expect(rowA.locator('.el-tag').filter({ hasText: '已撤销' }),
    '新增领用不得把已撤销单据改回进行中').toBeVisible()
})

test('[AF-05] 部门主管通过后，审批信息推进到下一环节且不再允许重复通过', async ({ context, page }) => {
  const d = await createDraft('appr')
  await apiPost(chen, 'approvals/action', {
    docKey: 'requisition', docId: d.id, bizType: 'REQUISITION',
    action: 'submit', comment: '提交领用审批',
    ctx: { amount: item.price, hasDiff: false }
  })

  const leader = REAL_ORG_DEPTS.find(x => x.deptName === '产品研发一部')!.actors.deptLeader
  const session = await loginViaApi({ username: leader.username, password: leader.password })
  await seedSession(context, session)
  await page.goto('/low-value-assets?tab=requisition')

  const row = page.locator('.el-table__row').filter({ hasText: d.docNo }).first()
  await expect(row).toBeVisible()
  const openDialog = async () => {
    await row.getByRole('button', { name: '审批信息' }).click()
    const dlg = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
    await expect(dlg).toBeVisible()
    return dlg
  }

  const first = await openDialog()
  await expect(first.getByRole('button', { name: '通过', exact: true })).toBeVisible()
  await first.getByRole('button', { name: '通过', exact: true }).click()
  await expect(first, '非协作动作通过后应关闭弹窗').toBeHidden()

  const trails = await withApi(chen, async api =>
    (await api.get('/api/fixed-asset-doc-approvals?pageSize=2000')).json())
  const agree = trails.data.filter((t: Record<string, unknown>) =>
    t.docCode === d.docNo && t.result === 'AGREE')
  expect(agree.length, '后端应记录部门主管的一次通过').toBe(1)

  // 重新打开：轨迹刷新后当前环节必须是第二环节，且部门主管不再看到「通过」
  const second = await openDialog()
  await expect(second.locator('tr').filter({ hasText: '当前环节' }),
    '界面应推进到仓管员出库确认').toContainText('仓管员出库确认')
  await expect(second.getByRole('button', { name: '通过', exact: true }),
    '已通过本环节的人不应再看到通过按钮').toHaveCount(0)
  await expect(second.locator('.el-timeline')).toContainText('石顺中')
  await expect(second.locator('.step-list li').first()).toContainText('已通过')
})
