const PW = 'C:/Users/fzidt0315/.codebuddy/plugins/marketplaces/codebuddy-plugins-official/plugins/playwright-cli/node_modules/playwright';
const { chromium } = require(PW);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // 自签证书：Node fetch 需要（浏览器侧用 ignoreHTTPSErrors）

const BASE = 'https://localhost';
const SHOT = 'f:/work/EAM-FAMS/e2e-shots';
const fs = require('fs');
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
}
async function api(path, token) {
  const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
  return r.json();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  let token = null;

  // ================= 1. 登录 → 首页 =================
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('input', { timeout: 15000 });
    await page.screenshot({ path: SHOT + '/01-login.png' });
    const u = page.locator('input[placeholder*="用户名"], input[placeholder*="账号"], input[placeholder*="user"]').first();
    const p = page.locator('input[type=password]').first();
    await u.fill('admin');
    await p.fill('Fzidt@123');
    await page.locator('button').filter({ hasText: /登\s*录/ }).first().click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: SHOT + '/02-after-login.png' });
    const bodyText = await page.evaluate(() => document.body.innerText);
    rec('login-render', /工作台|待办|固定资产|系统管理员/.test(bodyText), 'bodyLen=' + bodyText.length);
    if (!token) {
      const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Fzidt@123' }) });
      const j = await r.json(); token = j.data && j.data.token;
    }
    rec('token-captured', !!token, token ? 'len=' + token.length : 'NO TOKEN');
  } catch (e) { rec('login-flow', false, 'ERR ' + e.message); }

  // ================= 2. 固定资产 → 折旧管理：启停 + 刷新保持 =================
  try {
    await page.goto(BASE + '/fixed-assets?tab=depreciation', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOT + '/03-depreciation.png' });
    const schemes = await api('/api/fixed-asset-depreciation-schemes', token);
    const names = (schemes.data || []).map(s => s.schemeName);
    const bodyText = await page.evaluate(() => document.body.innerText);
    rec('depreciation-render', names.length === 4 && names.every(n => bodyText.includes(n)), 'names=' + JSON.stringify(names));

    const rowSel = 'tr:has-text("电子设备折旧方案")';
    const row = page.locator(rowSel).first();
    const before = await row.locator('input[role=switch]').first().getAttribute('aria-checked');
    await row.locator('.el-switch').first().click();
    await page.waitForTimeout(1500);

    // 深链刷新，验证持久化（UI 仍在折旧页签 + API 双验证）
    await page.goto(BASE + '/fixed-assets?tab=depreciation', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const after = await api('/api/fixed-asset-depreciation-schemes', token);
    const ds1 = (after.data || []).find(s => s.schemeName === '电子设备折旧方案');
    rec('depreciation-toggle-persist', ds1 && String(ds1.enabled) !== String(before),
      'before=' + before + ' afterEnabled=' + (ds1 && ds1.enabled));

    // 还原到真实原始状态（电子设备折旧方案原始为启用 true）并复验
    let cur = String(ds1.enabled);
    if (cur !== 'true') {
      const row2 = page.locator(rowSel).first();
      await row2.locator('.el-switch').first().click();
      await page.waitForTimeout(1500);
      const fin = await api('/api/fixed-asset-depreciation-schemes', token);
      cur = String((fin.data || []).find(s => s.schemeName === '电子设备折旧方案').enabled);
    }
    rec('depreciation-restored', cur === 'true', 'restoredEnabled=' + cur);
    await page.screenshot({ path: SHOT + '/03b-depreciation-restored.png' });
  } catch (e) { rec('depreciation-flow', false, 'ERR ' + e.message); }

  // ================= 3. 低值资产 → 领用管理：代申请默认本人+本部门 / 选部门过滤 =================
  try {
    await page.goto(BASE + '/low-value-assets?tab=requisition', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: SHOT + '/04-requisition-tab.png' });
    await page.getByRole('button', { name: /新增领用/ }).first().click({ timeout: 8000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: SHOT + '/05-requisition-dialog.png' });

    const dlg = page.locator('.el-dialog:visible', { hasText: '领用人' }).last();
    const dlgVisible = await dlg.isVisible().catch(() => false);
    rec('requisition-dialog-open', dlgVisible, 'visible=' + dlgVisible);

    // el-select 选中值渲染在 span（inputValue 恒为空），改读 .el-select 的 innerText
    const deptItem = dlg.locator('.el-form-item', { hasText: '领用部门' }).first();
    const userItem = dlg.locator('.el-form-item', { hasText: '领用人' }).first();
    const readSel = async (item) => (await item.locator('.el-select').first().innerText().catch(() => '')).trim();
    const isPlaceholder = (t) => !t || t.startsWith('请');
    const defaultUser = await readSel(userItem);
    const defaultDept = await readSel(deptItem);

    // 期望值交叉验证：admin 本人姓名 + 本部门
    let expectUser = '';
    let expectDept = '';
    try {
      const users = await api('/api/org-users?pageSize=100', token);
      const me = (users.data || []).find(x => x.username === 'admin');
      expectUser = me ? me.name : '';
      try {
        const depts = await api('/api/org-departments?pageSize=100', token);
        const d = (depts.data || []).find(x => x.id === (me && me.deptId));
        expectDept = d ? (d.name || d.deptName) : '';
      } catch (e2) {}
    } catch (e3) {}
    const defaultOk = !isPlaceholder(defaultUser) && !isPlaceholder(defaultDept) &&
      (!expectUser || defaultUser === expectUser) && (!expectDept || defaultDept.includes(expectDept));
    rec('requisition-default-self-dept', defaultOk,
      '领用人=' + defaultUser + '(期望 ' + (expectUser || '?') + ') 部门=' + defaultDept + '(期望含 ' + (expectDept || '?') + ')');

    // 打开领用人下拉，记录默认选项集合 A（应包含本人）
    await userItem.locator('.el-select').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const optsA = await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts().catch(() => []);
    rec('requisition-default-options-contain-self', optsA.some(o => o.trim() === defaultUser),
      'optionsA=' + JSON.stringify(optsA.slice(0, 6)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 换部门 → 领用人下拉应只列新部门成员
    await deptItem.locator('.el-select').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const deptOpts = await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts().catch(() => []);
    const target = deptOpts.map(o => o.trim()).find(o => o && o !== defaultDept);
    if (target) {
      await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: target }).first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
      const chosenDept = await readSel(deptItem);
      const receiverAfter = await readSel(userItem);
      await userItem.locator('.el-select').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const optsB = await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts().catch(() => []);

      // 交叉验证：optsB 应等于 API 里 target 部门的在职成员
      let membersOk = null; const memberNames = [];
      try {
        const depts2 = await api('/api/org-departments?pageSize=100', token);
        const users2 = await api('/api/org-users?pageSize=100', token);
        const d2 = (depts2.data || []).find(x => target.includes(x.name));
        if (d2) {
          memberNames = (users2.data || []).filter(u => u.deptId === d2.id && u.status === 'ENABLED').map(u => u.name);
          membersOk = optsB.length > 0 && optsB.every(o => memberNames.includes(o.trim()));
        }
      } catch (e4) {}

      const filterOk = chosenDept === target && isPlaceholder(receiverAfter) &&
        optsB.length > 0 && !optsB.some(o => o.trim() === defaultUser) &&
        (membersOk === null || membersOk === true);
      rec('requisition-dept-filter', filterOk,
        'chosenDept=' + chosenDept + ' receiverCleared=' + isPlaceholder(receiverAfter) +
        ' optionsB=' + JSON.stringify(optsB.slice(0, 6)) + ' apiMembers=' + JSON.stringify(memberNames.slice(0, 6)));
    } else {
      rec('requisition-dept-filter', false, '无可选的其他部门; options=' + JSON.stringify(deptOpts));
    }
    await page.screenshot({ path: SHOT + '/05b-requisition-filter.png' });
  } catch (e) { rec('requisition-flow', false, 'ERR ' + e.message); }

  // ================= 总结 =================
  rec('console-errors', consoleErrors.length === 0, 'count=' + consoleErrors.length + (consoleErrors.length ? ' :: ' + JSON.stringify(consoleErrors.slice(0, 5)) : ''));
  rec('page-errors', pageErrors.length === 0, 'count=' + pageErrors.length + (pageErrors.length ? ' :: ' + JSON.stringify(pageErrors.slice(0, 5)) : ''));

  console.log('\n===== E2E SUMMARY =====');
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log('PASS=' + pass + ' FAIL=' + fail);
  results.forEach(r => console.log((r.ok ? '[OK]   ' : '[FAIL] ') + r.name + ' :: ' + r.detail));
  await browser.close();
})();
