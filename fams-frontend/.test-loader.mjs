/**
 * 测试用 ESM Loader：
 * - 把 `import.meta.env` 替换为字面量（Node 环境下没有 Vite 的 env）
 * - .vue 文件返回空模块（单测只跑 .js）
 * - 兼容 Vite 的无扩展名导入（'./asset' → './asset.js'）与目录导入（'../../' → '../../index.js'）
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.vue')) {
    return {
      url: 'data:text/javascript,export default {}',
      shortCircuit: true,
      format: 'module'
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (e) {
    if (!context.parentURL || !specifier.startsWith('.')) throw e
    const base = new URL(specifier, context.parentURL)
    const candidates = base.href.endsWith('/')
      ? [new URL('index.js', base).href]
      : [base.href + '.js', new URL(base.href + '/index.js').href]
    for (const c of candidates) {
      try {
        return await nextResolve(c, context)
      } catch (_) { /* 继续尝试下一个候选 */ }
    }
    throw e
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.js$/.test(url)) {
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(new URL(url), 'utf8')
    if (raw.includes('import.meta.env')) {
      const source = raw.replace(
        /import\.meta\.env/g,
        `({VITE_USE_MOCK:'true',DEV:${process.env.TEST_DEV === '1'},MODE:'test',BASE_URL:'/'})`
      )
      return { format: 'module', source, shortCircuit: true }
    }
  }
  return nextLoad(url, context)
}
