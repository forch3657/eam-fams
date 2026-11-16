/**
 * D1 验收：三级公司组织树
 *
 * 集团 → 二级研究院 → 三家三级子公司，公司节点与部门节点都要递归展开；
 * 组织数据误改成环时不能无限递归。
 *
 * 运行：node --experimental-loader ./.test-loader.mjs ./orgTree.test.mjs
 */
import { createPinia, setActivePinia } from 'pinia'
import { registerAllSeeds } from './src/services/mock/seed/index.js'
import { useOrgStore } from './src/store/org.js'

let pass = 0
const fails = []
function ok(cond, msg) {
  if (cond) pass++
  else fails.push(msg)
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg}（期望 ${expected}，实际 ${actual}）`)
}

const memStore = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  }
}
globalThis.localStorage = memStore()
globalThis.sessionStorage = memStore()

setActivePinia(createPinia())
registerAllSeeds()
const org = useOrgStore()
await org.loadAll()

const companies = [
  { id: 'G', code: 'GS-0005', name: '集团', parentId: null, status: 'ENABLED', sort: 1 },
  { id: 'R', code: 'GS-0001', name: '研究院', parentId: 'G', status: 'ENABLED', sort: 1 },
  { id: 'Z', code: 'GS-0002', name: '至臻', parentId: 'R', status: 'ENABLED', sort: 1 },
  { id: 'X', code: 'GS-0003', name: '新视', parentId: 'R', status: 'ENABLED', sort: 2 },
  { id: 'S', code: 'GS-0004', name: '数源', parentId: 'R', status: 'ENABLED', sort: 3 }
]
const departments = [
  { id: 'DR', companyId: 'R', parentId: null, name: '综合管理部', status: 'ENABLED', sort: 1 },
  { id: 'DR1', companyId: 'R', parentId: 'DR', name: '行政组', status: 'ENABLED', sort: 1 },
  { id: 'DZ', companyId: 'Z', parentId: null, name: '至臻研发部', status: 'ENABLED', sort: 1 },
  { id: 'DX', companyId: 'X', parentId: null, name: '新视研发部', status: 'ENABLED', sort: 1 },
  { id: 'DS', companyId: 'S', parentId: null, name: '数源数据运营中心', status: 'ENABLED', sort: 1 }
]
org.companies = companies
org.departments = departments

// 1. 公司树递归
const companyTree = org.companyTree
eq(companyTree.length, 1, '公司树根为一级集团')
eq(companyTree[0].children.length, 1, '集团下为二级研究院')
eq(companyTree[0].children[0].children.length, 3, '研究院下为三家三级公司')

// 2. 组织树：公司层级递归 + 部门层级递归
const tree = org.deptTree
eq(tree.length, 1, '组织树根节点数')
eq(tree[0].id, 'G', '组织树根为集团')
const research = tree[0].children.find(n => n.id === 'R')
ok(!!research, '组织树包含二级研究院节点')
const subs = research ? research.children.filter(n => n.type === 'company') : []
eq(subs.length, 3, '研究院节点下挂三家三级公司')
const zhizhen = subs.find(n => n.id === 'Z')
ok(!!zhizhen && Array.isArray(zhizhen.children) && zhizhen.children.some(d => d.id === 'DZ'),
  '三级公司节点带本公司部门')
const xinshi = subs.find(n => n.id === 'X')
ok(!!xinshi && Array.isArray(xinshi.children) && xinshi.children.some(d => d.id === 'DX'),
  '另一三级公司节点带本公司部门')
const shuyuan = subs.find(n => n.id === 'S')
ok(!!shuyuan && Array.isArray(shuyuan.children) && shuyuan.children.some(d => d.id === 'DS'),
  '第三家三级公司节点带本公司部门')
const dr = research ? research.children.find(n => n.id === 'DR') : null
ok(!!dr && Array.isArray(dr.children) && dr.children.some(d => d.id === 'DR1'),
  '二级公司直属部门带子部门')

// 3. 组织数据成环时有限展开
org.companies = companies.map(c => {
  if (c.id === 'Z') return { ...c, parentId: 'X' }
  if (c.id === 'X') return { ...c, parentId: 'Z' }
  return c
})
let cyclic = ''
try {
  cyclic = JSON.stringify(org.deptTree)
} catch (e) {
  fails.push('组织数据成环时组织树构建抛异常：' + e.message)
}
ok(cyclic.length > 0 && cyclic.length < 10000, '组织数据成环时仍有限展开，不死循环')

if (fails.length) {
  console.error(`组织树三级/防环测试：通过 ${pass} 项，失败 ${fails.length} 项`)
  fails.forEach(f => console.error('  - ' + f))
  process.exit(1)
} else {
  console.log(`组织树三级/防环测试：通过 ${pass} 项，失败 0 项`)
  console.log('全部通过 ✅')
}
