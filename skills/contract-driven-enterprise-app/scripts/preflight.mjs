#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULTS = {
  excludeDirs: [
    'node_modules', 'target', 'dist', 'build', '.git', '.codebuddy', '.idea', '.vscode',
    'playwright-report', 'e2e-artifacts', 'coverage', 'skills'
  ],
  maxFileBytes: 2 * 1024 * 1024,
  rules: {}
};

const TEXT_EXT = new Set([
  '.java', '.kt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue',
  '.json', '.xml', '.yml', '.yaml', '.ps1', '.sh', '.bat', '.csv', '.sql',
  '.md', '.properties', '.env', '.example'
]);

const HELP = `发布前静态门禁（只读启发式扫描，不替代编译/单测/人工点测）

用法:
  node preflight.mjs --root <项目根> [--config <config.json>] [--json] [--help]

参数:
  --root      要扫描的项目根目录，默认当前工作目录
  --config    配置 JSON，可覆盖 excludeDirs / maxFileBytes / rules
  --json      仅输出结构化 JSON，供 CI 消费
  --help      显示本帮助

规则（默认 severity）:
  ERROR  contract-solo-change  仅契约产物变更而 schema 源未变
  ERROR  plaintext-password    明文口令比对
  WARN   weak-default-password 演示/测试种子中的弱默认口令
  ERROR  e2e-destructive-sql   E2E 代码中非 E2E_ 前缀的破坏性 SQL
  ERROR  utf16-bom             文本文件为 UTF-16LE/BE 编码
  WARN   ignore-auth           免鉴权注解 / permitAll 需人工核对白名单
  WARN   hardcoded-secret      疑似硬编码密钥
  WARN   ps1-non-ascii         PowerShell 5.1 下含非 ASCII 且无 UTF-8 BOM
  WARN   csv-without-bom       导入 CSV 缺 UTF-8 BOM
  WARN   skip-tests            构建入口跳过测试
  WARN   reporter-override     --reporter=list 覆盖报告器

退出码: 存在 ERROR 时为 1，否则 0。
配置示例: assets/preflight-config.example.json
`;

function parseArgs(argv) {
  const out = { root: process.cwd(), config: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') out.root = path.resolve(argv[++i] || '.');
    else if (arg === '--config') out.config = path.resolve(argv[++i] || '');
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function loadConfig(configPath) {
  const cfg = { ...DEFAULTS, rules: {} };
  if (!configPath) return cfg;
  const user = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (Array.isArray(user.excludeDirs)) cfg.excludeDirs = user.excludeDirs;
  if (Number.isFinite(user.maxFileBytes)) cfg.maxFileBytes = user.maxFileBytes;
  if (user.rules && typeof user.rules === 'object') cfg.rules = user.rules;
  return cfg;
}

function walk(dir, cfg, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (cfg.excludeDirs.includes(entry.name)) continue;
      walk(abs, cfg, acc);
    } else if (entry.isFile()) {
      acc.push(abs);
    }
  }
}

function loadFiles(root, cfg) {
  const paths = [];
  walk(root, cfg, paths);
  const files = [];
  for (const abs of paths) {
    const ext = path.extname(abs).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.size === 0 || stat.size > cfg.maxFileBytes) continue;
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue;
    }
    const text = buf.toString('utf8');
    files.push({
      rel: path.relative(root, abs).replace(/\\/g, '/'),
      ext,
      buf,
      text,
      lines: text.split(/\r?\n/)
    });
  }
  return files;
}

function makeReporter(cfg) {
  const findings = [];
  const skips = [];
  const perRule = new Map();

  function emit(rule, defaultSeverity, file, line, message) {
    const override = cfg.rules[rule] || {};
    if (override.enabled === false || override.severity === 'OFF') return;
    const severity = override.severity || defaultSeverity;
    const count = perRule.get(rule) || 0;
    if (count >= 20) return;
    perRule.set(rule, count + 1);
    findings.push({ rule, severity, file, line, message });
  }

  const seen = new Set();
  function emitOnce(rule, defaultSeverity, file, line, message) {
    const key = `${rule}|${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    emit(rule, defaultSeverity, file, line, message);
  }

  return { findings, skips, emit, emitOnce };
}

function changedFiles(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return out.split(/\r?\n/).filter(Boolean).map((line) => {
      const raw = line.slice(3).trim();
      return (raw.split(' -> ').pop() || raw).replace(/\\/g, '/');
    }).filter(Boolean);
  } catch {
    return null;
  }
}

function scanLines(files, predicate, pattern, onMatch) {
  for (const file of files) {
    if (!predicate(file)) continue;
    file.lines.forEach((line, index) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) onMatch(file, index + 1, line.trim().slice(0, 160));
    });
  }
}

function runChecks(root, cfg, report) {
  const { emit, skips } = report;
  const files = loadFiles(root, cfg);

  const changed = changedFiles(root);
  if (changed === null) {
    skips.push('git 不可用或不是 git 仓库：跳过契约漂移检查');
  } else {
    const isOutput = (p) => /(^|\/)contract\/[^/]+\.json$/i.test(p);
    const isSource = (p) => /contract/i.test(p) && /(schema|enums|permissions)\.(js|mjs|ts)$/i.test(p);
    const outputs = changed.filter(isOutput);
    if (outputs.length > 0 && changed.filter(isSource).length === 0) {
      emit(
        'contract-solo-change', 'ERROR', '(git status)', 0,
        `契约产物变更但 schema 源未变：${outputs.slice(0, 3).join(', ')}；产物可能被手工修改，下次导出会抹掉`
      );
    }
  }

  for (const file of files) {
    if ((file.buf[0] === 0xff && file.buf[1] === 0xfe) || (file.buf[0] === 0xfe && file.buf[1] === 0xff)) {
      emit('utf16-bom', 'ERROR', file.rel, 0, '文件为 UTF-16 编码，需转为 UTF-8');
    }
    if (file.ext === '.ps1') {
      const hasUtf8Bom = file.buf[0] === 0xef && file.buf[1] === 0xbb && file.buf[2] === 0xbf;
      if (!hasUtf8Bom && /[^\x00-\x7f]/.test(file.text)) {
        emit('ps1-non-ascii', 'WARN', file.rel, 0, 'PowerShell 5.1 无 BOM 会按 ANSI 读取中文，需改为 ASCII-only');
      }
    }
    if (file.ext === '.csv' && !(file.buf[0] === 0xef && file.buf[1] === 0xbb && file.buf[2] === 0xbf)) {
      emit('csv-without-bom', 'WARN', file.rel, 0, '导入 CSV 建议 UTF-8 BOM，并禁止用 Excel 另存');
    }
  }

  const codeFile = (f) => /\.(java|kt|js|mjs|cjs|ts|tsx|jsx|vue)$/.test(f.ext);

  scanLines(files, codeFile, /(?:getPassword|getMima|getPwd)\(\)\s*\.\s*equals\s*\(/i,
    (f, n) => emit('plaintext-password', 'ERROR', f.rel, n, '疑似明文口令比对，必须改为加盐哈希校验'));
  scanLines(files, codeFile, /(?:password|mima|passwd|pwd)\s*[:=]\s*["'](?:123456|admin|test|111111|000000)["']/i,
    (f, n) => report.emitOnce('weak-default-password', 'WARN', f.rel, n, '演示/测试种子含弱默认口令；确认不会被用作生产 seed，生产须强口令 + 首登改密'));

  scanLines(files, codeFile, /@IgnoreAuth|@Anonymous|permitAll\s*\(/i,
    (f, n) => emit('ignore-auth', 'WARN', f.rel, n, '免鉴权注解/permitAll，核对是否只在健康检查/版本/登录白名单内'));

  scanLines(files, codeFile, /(?:secretKey|secretId|accessKey|accessKeyId|apiKey|appKey|amap[\w.]*key)\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/i,
    (f, n) => emit('hardcoded-secret', 'WARN', f.rel, n, '疑似硬编码密钥，应迁移到仓库外的本地配置'));

  const buildFile = (f) => /\.(ps1|sh|bat|yml|yaml|xml)$/.test(f.ext) || /package\.json$/i.test(f.rel);
  scanLines(files, buildFile, /-DskipTests|\bskipTests\b|--skip-tests/i,
    (f, n, line) => {
      if (/^(#|\/\/|<!--)/.test(line) || /\b(Write-Host|echo|console\.log)\b/i.test(line)) return;
      emit('skip-tests', 'WARN', f.rel, n, '构建入口跳过测试，确认是否为有意豁免（如仅为启动服务）');
    });

  const testCode = (f) => /\.(ts|js|mjs|cjs|py)$/.test(f.ext) && /(^|\/)(tests?|e2e|specs?)\//i.test('/' + f.rel);
  scanLines(files, testCode, /\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i,
    (f, n, line) => {
      if (/E2E_/i.test(line)) return;
      emit('e2e-destructive-sql', 'ERROR', f.rel, n, 'E2E 代码含非 E2E_ 前缀的破坏性 SQL，禁止自动清空业务数据');
    });

  scanLines(files, (f) => f.ext !== '.md', /--reporter\s*=\s*list\b/i,
    (f, n) => emit('reporter-override', 'WARN', f.rel, n, '会覆盖 html reporter 导致报告不更新'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!fs.existsSync(args.root) || !fs.statSync(args.root).isDirectory()) {
    process.stderr.write(`项目根不存在或不是目录: ${args.root}\n`);
    process.exitCode = 2;
    return;
  }
  const cfg = loadConfig(args.config);
  const report = makeReporter(cfg);
  runChecks(args.root, cfg, report);

  const summary = { ERROR: 0, WARN: 0 };
  for (const item of report.findings) summary[item.severity] = (summary[item.severity] || 0) + 1;
  const result = { root: args.root, summary, skips: report.skips, findings: report.findings };

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(`发布前静态门禁 | 根目录: ${args.root}\n`);
    for (const skip of report.skips) process.stdout.write(`  [SKIP] ${skip}\n`);
    if (report.findings.length === 0) {
      process.stdout.write('  未发现可疑项（启发式扫描，仍需编译、单测与人工点测）\n');
    } else {
      const ordered = [...report.findings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'ERROR' ? -1 : 1));
      for (const item of ordered) {
        const loc = item.line ? `:${item.line}` : '';
        process.stdout.write(`  [${item.severity}] ${item.rule} | ${item.file}${loc}\n         ${item.message}\n`);
      }
    }
    process.stdout.write(`汇总: ERROR ${summary.ERROR || 0} / WARN ${summary.WARN || 0}\n`);
  }
  process.exitCode = summary.ERROR > 0 ? 1 : 0;
}

main();
