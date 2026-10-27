import { expect, request, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/**
 * 关键点击流冒烟：覆盖「登录 → 折旧启停持久化 → 低值资产代申请联动」三条主线。
 *
 * 与旧的自研脚本 e2e-smoke.cjs 的区别：
 * - 使用 Playwright Test Runner：有 HTML/JUnit 报告、失败截图与 trace、用例级重试；
 * - 断言改为 expect（失败即抛，不再靠汇总计数，CI 能自动判红）；
 * - 折旧启停属于写操作，afterAll 强制校验「已还原到原始状态」，避免残留测试数据。
 *
 * 注意：本应用 token 存在 sessionStorage，storageState 无法跨 context 还原，
 * 因此每个用例都在 beforeEach 里做一次真实 UI 登录（用例保持相互独立）。
 */
const BASE = process.env.E2E_BASE_URL ?? 'https://localhost';
const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Fzidt@123';
const SCHEME = '电子设备折旧方案';
const EXPECTED_SCHEMES = ['电子设备折旧方案', '机械设备折旧方案', '运输设备折旧方案', '房屋建筑物折旧方案'];

let api: APIRequestContext;
let token = '';
let originalEnabled: boolean | null = null;

let consoleErrors: string[] = [];
let pageErrors: string[] = [];

function authHeader() {
  return { Authorization: `Bearer ${token}` };
}

async function apiGet(path: string) {
  const res = await api.get(path, { headers: authHeader() });
  expect(res.ok(), `${path} 应请求成功`).toBeTruthy();
  const body = await res.json();
  expect(body.code, `${path} 应返回 code=0`).toBe(0);
  return body.data;
}

async function currentScheme(): Promise<Record<string, any>> {
  const data = await apiGet('/api/fixed-asset-depreciation-schemes');
  const hit = (data ?? []).find((s: any) => s.schemeName === SCHEME);
  expect(hit, `折旧方案「${SCHEME}」应存在`).toBeTruthy();
  return hit as Record<string, any>;
}

async function me(): Promise<any | undefined> {
  const data = await apiGet('/api/org-users?pageSize=100');
  return (data ?? []).find((u: any) => u.username === USERNAME);
}

async function membersOfDeptLabel(deptLabel: string): Promise<string[]> {
  const depts = await apiGet('/api/org-departments?pageSize=100');
  const users = await apiGet('/api/org-users?pageSize=100');
  const dept = (depts ?? []).find((d: any) => deptLabel.includes(d.name));
  if (!dept) {
    return [];
  }
  return (users ?? [])
    .filter((u: any) => u.deptId === dept.id && u.status === 'ENABLED')
    .map((u: any) => u.name as string);
}

/** Element Plus 的 el-select 选中值渲染在 span，inputValue 恒为空，必须读 innerText */
async function selectText(item: Locator): Promise<string> {
  return (await item.locator('.el-select').first().innerText()).trim();
}

const isPlaceholder = (text: string) => !text || text.startsWith('请');

/**
 * 打开指定 el-select 并读出可选项。
 *
 * 关键点：上一个下拉的收起动画期间仍可能被判为 visible，直接读 :visible 会读到「残留的另一个下拉」。
 * 因此统一取「最后出现的那个可见下拉」（新打开的一定在 DOM 末尾），并留出收放动画时间。
 */
async function readOptions(page: Page, item: Locator): Promise<string[]> {
  const sel = item.locator('.el-select').first();
  // 切部门后表单会重渲染，第一次点击可能被吞；最多重试 3 次，直到下拉真正出现可见。
  for (let attempt = 0; attempt < 3; attempt++) {
    await sel.click();
    await page.waitForTimeout(500);
    const dropdown = page.locator('.el-select-dropdown:visible').last();
    if (await dropdown.count() === 0) continue;
    const options = dropdown.locator('.el-select-dropdown__item');
    if (await options.first().isVisible().catch(() => false)) {
      return (await options.allInnerTexts()).map(t => t.trim()).filter(Boolean);
    }
    // 「无数据」也是合法状态（例如切换到没有在职成员的部门），返回空数组
    if (await dropdown.locator('.el-select-dropdown__empty, .el-empty').first().isVisible().catch(() => false)) {
      return [];
    }
  }
  throw new Error('el-select 下拉未打开或无可读选项: ' + (await sel.innerText().catch(() => '')));
}

async function pickOption(page: Page, text: string): Promise<void> {
  await page
    .locator('.el-select-dropdown:visible')
    .last()
    .locator('.el-select-dropdown__item')
    .filter({ hasText: text })
    .first()
    .click();
  await page.waitForTimeout(500);
}

/**
 * 真实 UI 登录（token 存在 sessionStorage，无法用 storageState 还原，只能每次走登录界面）。
 * 已登录时自动跳过填表，保证幂等。
 */
async function login(page: Page): Promise<void> {
  // 直接进 /login：若用 '/' 会因 SPA 客户端重定向到 /login，瞬间 isVisible 判定会误判为未登录而跳过填表。
  await page.goto('/login');
  const userInput = page
    .locator('input[placeholder*="用户名"], input[placeholder*="账号"], input[placeholder*="user"]')
    .first();
  await expect(userInput).toBeVisible({ timeout: 30_000 });
  await userInput.fill(USERNAME);
  await page.locator('input[type=password]').first().fill(PASSWORD);
  await page.locator('button').filter({ hasText: /登\s*录/ }).first().click();
  // 不能用 /固定资产/ 判定登录成功——登录页标题就是「固定资产管理系统」，会误判。
  // 正确做法是等待路由真正离开登录页，并确认主框架（侧边菜单）已渲染。
  await page.waitForURL(/workbench/, { timeout: 30_000 });
  await expect(page.locator('.el-menu').first()).toBeVisible();
}

async function openRequisitionDialog(page: Page): Promise<Locator> {
  await page.goto('/low-value-assets?tab=requisition');
  await page.getByRole('button', { name: /新增领用/ }).first().click();
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '领用人' }).last();
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
  const res = await api.post('/api/auth/login', { data: { username: USERNAME, password: PASSWORD } });
  expect(res.ok(), '登录接口应成功').toBeTruthy();
  const body = await res.json();
  expect(body.code, '登录应返回 code=0').toBe(0);
  token = body.data.token as string;
  expect(token.length, '应取到有效 token').toBeGreaterThan(10);
  originalEnabled = Boolean((await currentScheme()).enabled);
});

test.afterAll(async () => {
  // 无论用例成败，都必须回到原始状态，杜绝测试数据残留
  const current = await currentScheme().catch(() => null);
  if (current && originalEnabled !== null) {
    expect(Boolean(current.enabled), '折旧方案必须还原为原始启用状态').toBe(originalEnabled);
  }
  await api?.dispose();
});

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  await login(page);
});

test.afterEach(() => {
  // 忽略 favicon 等资源 404：dev 模式浏览器会自动请求 favicon.ico（缺失则报控制台错误），
  // prod/nginx 不报，属测试环境噪声；但 /api/ 相关的失败仍保留，用于捕获真实接口错误。
  const benign = (e: string) => /Failed to load resource/i.test(e) && !e.includes('/api/');
  expect(consoleErrors.filter(e => !benign(e)), '控制台不应有错误输出').toEqual([]);
  expect(pageErrors, '不应出现未捕获的 JS 异常').toEqual([]);
});

test('登录后进入工作台，界面元素正常渲染', async ({ page }) => {
  await expect(page).toHaveURL(/workbench/);
  await expect(page.locator('.el-menu').first()).toBeVisible();
  await expect(page.locator('body')).toContainText('工作台');
});

test('折旧方案列表渲染出全部中文方案名', async ({ page }) => {
  await page.goto('/fixed-assets?tab=depreciation');
  // 不要断言通用 .el-table：页面里存在多个隐藏页签的表格，.first() 可能命中不可见的那个。
  // 直接断言折旧页签里的目标行可见，语义也更明确。
  await expect(page.locator('tr', { hasText: SCHEME }).first()).toBeVisible();

  const remoteNames = ((await apiGet('/api/fixed-asset-depreciation-schemes')) ?? []).map(
    (s: any) => s.schemeName as string,
  );
  expect(remoteNames).toEqual(expect.arrayContaining(EXPECTED_SCHEMES));
  for (const name of EXPECTED_SCHEMES) {
    await expect(page.locator('body')).toContainText(name);
  }
});

test('折旧启停：UI 操作后深链刷新仍持久化，并还原到原始状态', async ({ page }) => {
  await page.goto('/fixed-assets?tab=depreciation');
  const row = page.locator('tr', { hasText: SCHEME }).first();
  await expect(row).toBeVisible();

  const before = Boolean((await currentScheme()).enabled);
  await row.locator('.el-switch').first().click();
  await expect
    .poll(async () => Boolean((await currentScheme()).enabled), { timeout: 20_000 })
    .toBe(!before);

  // 深链刷新后接口应保持变更
  await page.goto('/fixed-assets?tab=depreciation');
  expect(Boolean((await currentScheme()).enabled), '开关变更应持久化').toBe(!before);
  await expect(page.locator('tr', { hasText: SCHEME }).first()).toBeVisible();

  // 还原
  await page.locator('tr', { hasText: SCHEME }).first().locator('.el-switch').first().click();
  await expect
    .poll(async () => Boolean((await currentScheme()).enabled), { timeout: 20_000 })
    .toBe(before);
});

test('领用对话框默认预填「本人 + 本部门」', async ({ page }) => {
  const dialog = await openRequisitionDialog(page);
  const deptItem = dialog.locator('.el-form-item', { hasText: '领用部门' }).first();
  const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

  const userText = await selectText(userItem);
  const deptText = await selectText(deptItem);
  expect(isPlaceholder(userText), '领用人应默认预填本人').toBe(false);
  expect(isPlaceholder(deptText), '领用部门应默认预填本部门').toBe(false);

  const user = await me();
  if (user?.name) {
    expect(userText).toBe(user.name as string);
  }
  const members = await membersOfDeptLabel(deptText);
  expect(members.length, '本部门应有在职成员').toBeGreaterThan(0);
});

test('领用人下拉默认列出本部门成员且包含本人', async ({ page }) => {
  const dialog = await openRequisitionDialog(page);
  const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

  const names = await readOptions(page, userItem);
  expect(names.length, '下拉应有可选成员').toBeGreaterThan(0);
  const user = await me();
  if (user?.name) {
    expect(names).toContain(user.name as string);
  }
});

test('切换部门后领用人清空，下拉按新部门成员过滤', async ({ page }) => {
  const dialog = await openRequisitionDialog(page);
  const deptItem = dialog.locator('.el-form-item', { hasText: '领用部门' }).first();
  const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

  const defaultDept = await selectText(deptItem);
  const defaultUser = await selectText(userItem);

  const deptNames = await readOptions(page, deptItem);
  // 优先选「有在职成员」的其他部门，才能验证过滤语义；若其他部门都没有成员，则退化为验证「无数据」空列表
  const candidates = await Promise.all(
    deptNames.filter(n => n !== defaultDept).map(async label => ({ label, members: await membersOfDeptLabel(label) })),
  );
  const preferred = candidates.find(c => c.members.length > 0);
  const target = (preferred ?? candidates[0])?.label;
  expect(target, '应至少存在另一个可选部门').toBeTruthy();
  await pickOption(page, target as string);

  expect(await selectText(deptItem)).toBe(target as string);
  expect(isPlaceholder(await selectText(userItem)), '切换部门后领用人应被清空').toBe(true);

  const names = await readOptions(page, userItem);
  const members = await membersOfDeptLabel(target as string);
  if (members.length === 0) {
    expect(names, '无成员部门的下拉应为空（无数据）').toEqual([]);
  } else {
    expect(names.length, '新部门应有可选成员').toBeGreaterThan(0);
    expect(names, '不应再包含原部门人员').not.toContain(defaultUser);
    // 与接口交叉：下拉成员必须是新部门的在职成员
    for (const name of names) {
      expect(members).toContain(name);
    }
  }
});
