import { expect, request, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { loginViaApi, seedSession } from './fixtures/auth';
import { cleanupTemp, createTempUser, type TempUser } from './fixtures/data';
import { ADMIN, BASE_URL } from './fixtures/env';

/**
 * 关键点击流冒烟：覆盖「登录 → 折旧管理台账 → 低值资产领用默认值」三条主线。
 *
 * 与旧的自研脚本 e2e-smoke.cjs 的区别：
 * - 使用 Playwright Test Runner：有 HTML/JUnit 报告、失败截图与 trace、用例级重试；
 * - 断言改为 expect（失败即抛，不再靠汇总计数，CI 能自动判红）；
 * - 界面数据一律与接口交叉校验，避免「页面有壳没数据」也算通过。
 *
 * 注意：本应用 token 存在 sessionStorage，storageState 无法跨 context 还原，
 * 因此每个用例都在 beforeEach 里做一次真实 UI 登录（用例保持相互独立）。
 */
const BASE = BASE_URL;
const USERNAME = ADMIN.username;
const PASSWORD = ADMIN.password;

let api: APIRequestContext;
let token = '';

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

/** 折旧台账的默认期间：当前自然月（与页面默认一致） */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function me(username: string = USERNAME): Promise<any | undefined> {
  const data = await apiGet('/api/org-users?pageSize=500');
  return (data ?? []).find((u: any) => u.username === username);
}

/**
 * 按下拉标签（部门名（公司名））反查该部门的在职成员。
 *
 * 不同公司存在同名部门（如两个「综合管理部」），只按名字匹配会串到别的公司，
 * 因此标签里的公司名必须一起参与匹配。
 */
async function membersOfDeptLabel(deptLabel: string): Promise<string[]> {
  const [depts, users, companies] = await Promise.all([
    apiGet('/api/org-departments?pageSize=500'),
    apiGet('/api/org-users?pageSize=500'),
    apiGet('/api/org-companies?pageSize=200'),
  ]);
  const matched = /^(.*?)（(.*)）$/.exec(deptLabel);
  const deptName = matched?.[1] ?? deptLabel;
  const companyName = matched?.[2] ?? '';
  const dept = (depts ?? []).find(
    (d: any) =>
      d.name === deptName &&
      (!companyName || (companies ?? []).find((c: any) => c.id === d.companyId)?.name === companyName),
  );
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
 * 真实 UI 登录（token 存在 sessionStorage，无法用 storageState 还原，只能走登录界面）。
 * 默认用管理员账号；需要验证「本人部门」相关默认值时传入有部门的账号。
 */
async function login(
  page: Page,
  credentials: { username: string; password: string } = { username: USERNAME, password: PASSWORD },
): Promise<void> {
  // 直接进 /login：若用 '/' 会因 SPA 客户端重定向到 /login，瞬间 isVisible 判定会误判为未登录而跳过填表。
  await page.goto('/login');
  // 登录页占位文案是「请输入手机号（管理员用 admin）」，直接取表单内首个输入框最稳
  const userInput = page.locator('.login-form input').first();
  await expect(userInput).toBeVisible({ timeout: 30_000 });
  await userInput.fill(credentials.username);
  await page.locator('input[type=password]').first().fill(credentials.password);
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
});

test.afterAll(async () => {
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

/**
 * 折旧管理：前端已废弃「折旧方案」配置，改为「后端统一计提 + 台账展示」。
 * 断言口径随之调整为「页面台账 = 接口台账」，避免用例绑死在已删除的界面上。
 */
test('折旧管理展示当期计提台账，且与接口数据一致', async ({ page }) => {
  await page.goto('/fixed-assets?tab=depreciation');
  // 页面里有多组嵌套页签，不能用 .el-tabs__item.is-active 泛匹配（会命中隐藏子页签）
  const tab = page.getByRole('tab', { name: '折旧管理', exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('body')).toContainText('本期计提折旧');

  const plan = await apiGet(`/api/depreciation/plan?period=${currentPeriod()}`);
  expect(plan?.rows?.length, '当期应有计提台账').toBeGreaterThan(0);

  const first = plan.rows[0];
  // 首行资产编号必须真实出现在页面上，防止「接口有数据、页面空表」。
  // 必须限定在可见页签内：资产台账等隐藏页签里也有同一资产编号，泛匹配会命中隐藏行。
  await expect(page.locator('.el-tab-pane:visible tr', { hasText: first.assetNo }).first()).toBeVisible();
  // 合计与接口同源：金额按页面同款格式化后比对
  const monthly = Number(plan.periodDepreciation).toLocaleString();
  await expect(page.locator('body')).toContainText(monthly);
});

test('折旧管理：深链刷新后仍停留在该页签且数据不丢', async ({ page }) => {
  const plan = await apiGet(`/api/depreciation/plan?period=${currentPeriod()}`);
  expect(plan?.rows?.length, '当期应有计提台账').toBeGreaterThan(0);
  const assetNo = plan.rows[0].assetNo as string;

  await page.goto('/fixed-assets?tab=depreciation');
  const tab = page.getByRole('tab', { name: '折旧管理', exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const row = page.locator('.el-tab-pane:visible tr', { hasText: assetNo }).first();
  await expect(row).toBeVisible();

  await page.reload();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(row).toBeVisible();
});

/**
 * 领用默认值必须用「有部门」的账号验证。
 *
 * 系统管理员这类账号可能没有部门（组织数据调整后 deptId 会被清空），
 * 此时没有「本部门」可预填，用它断言只会暴露数据漂移而不是功能缺陷。
 * 这里临时建一个 E2E_ 前缀的部门账号，跑完即删，不依赖既有账号的归属。
 */
test.describe('领用默认值（部门账号）', () => {
  let adminSession: Awaited<ReturnType<typeof loginViaApi>>;
  let deptUser: TempUser;

  test.beforeAll(async () => {
    adminSession = await loginViaApi();
    const roleId = (adminSession.user.roleIds ?? [])[0];
    if (!roleId) {
      throw new Error('管理员账号未绑定角色，无法创建临时用户');
    }
    deptUser = await createTempUser(adminSession, roleId);
  });

  // 外层 beforeEach 已用管理员登录，这里把会话换成临时账号；addInitScript 在下一次导航生效
  test.beforeEach(async ({ context }) => {
    const session = await loginViaApi({ username: deptUser.username, password: deptUser.password });
    await seedSession(context, session);
  });

  test.afterAll(async () => {
    if (adminSession) {
      await cleanupTemp(adminSession, { userId: deptUser?.id });
    }
  });

  test('领用对话框默认预填「本人 + 本部门」', async ({ page }) => {
    const dialog = await openRequisitionDialog(page);
    const deptItem = dialog.locator('.el-form-item', { hasText: '领用部门' }).first();
    const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

    const userText = await selectText(userItem);
    const deptText = await selectText(deptItem);
    expect(isPlaceholder(userText), '领用人应默认预填本人').toBe(false);
    expect(isPlaceholder(deptText), '领用部门应默认预填本部门').toBe(false);

    const user = await me(deptUser.username);
    expect(user?.name, '临时账号应能在组织用户接口中查到').toBeTruthy();
    expect(userText).toBe(user?.name as string);

    const members = await membersOfDeptLabel(deptText);
    expect(members.length, '本部门应有在职成员').toBeGreaterThan(0);
  });

  test('领用人下拉默认列出本部门成员且包含本人', async ({ page }) => {
    const dialog = await openRequisitionDialog(page);
    const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

    const names = await readOptions(page, userItem);
    expect(names.length, '下拉应有可选成员').toBeGreaterThan(0);
    expect(names).toContain(deptUser.name);
  });

  test('切换部门后领用人清空，下拉按新部门成员过滤', async ({ page }) => {
    const dialog = await openRequisitionDialog(page);
    const deptItem = dialog.locator('.el-form-item', { hasText: '领用部门' }).first();
    const userItem = dialog.locator('.el-form-item', { hasText: '领用人' }).first();

    const defaultDept = await selectText(deptItem);
    const defaultUser = await selectText(userItem);
    expect(defaultUser).toBe(deptUser.name);

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
});
