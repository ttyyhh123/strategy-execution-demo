/**
 * 云端接入自检：用应用的 publicConfig 直接访问云数据库，验证
 * 读取/初始化、带版本号写入、并发冲突识别与流转留痕。
 *
 * 运行：node scripts/cloud-roundtrip.mjs
 * 说明：浏览器里同源访问不需要设置 Origin；Node 环境按发布域名补齐，
 * 因为云端按应用发布域名做 Origin 校验。
 */
const releaseOrigin = 'https://strategy-execution-helper.app.workbuddy.host'

const nativeFetch = globalThis.fetch
globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  if (!headers.has('origin')) headers.set('origin', releaseOrigin)
  return nativeFetch(input, { ...init, headers })
}

const {
  CloudConflictError, createWorkspace, fetchActivity, loadWorkspace, logActivity, saveWorkspace,
} = await import('../src/cloud.js')
const { seedScenario } = await import('../src/domain.js')

const state = { flow: seedScenario('flow'), review: seedScenario('review'), role: 'approver', scenario: 'review' }
const failures = []
function check(label, condition, extra = {}) {
  if (condition) console.log('  ok   ' + label)
  else { failures.push(label); console.log('  FAIL ' + label, extra) }
}

console.log('1) 读取 / 初始化工作区')
let workspace = await loadWorkspace()
if (!workspace) {
  workspace = await createWorkspace(state)
  console.log('  created, revision = ' + workspace.revision)
}
workspace = await loadWorkspace()
const payload = workspace.payload
check('读回工作区快照', Array.isArray(payload?.flow?.projects) && Array.isArray(payload?.review?.projects))
check('项目名称正确', payload?.review?.projects?.[0]?.name === '远程诊断模块')
check('版本号为正整数', Number.isInteger(Number(workspace.revision)) && Number(workspace.revision) > 0)

console.log('2) 带版本号写入（乐观并发）')
const before = Number(workspace.revision)
const next = await saveWorkspace({ payload, revision: before, updatedBy: '自检脚本' })
check('写入返回新版本号 = ' + next, next === before + 1, { before, next })

console.log('3) 用过旧版本号写入应被拒绝')
let conflicted = false
try {
  await saveWorkspace({ payload, revision: before, updatedBy: '过期客户端' })
} catch (error) {
  conflicted = error instanceof CloudConflictError
}
check('旧版本号写入抛出冲突', conflicted)

console.log('4) 流转留痕写入与查询')
const marker = 'cloud-check-' + Date.now()
await logActivity({
  action: '云端接入验证', actor: '系统自检', project_name: '远程诊断模块',
  version: 2, href: null, detail: marker,
})
const rows = await fetchActivity(6)
check('留痕出现在最近记录里', rows.some(row => row.detail === marker))
check('留痕字段完整', rows[0] && 'action' in rows[0] && 'created_at' in rows[0])

console.log(failures.length ? '\n自检失败：' + failures.join('；') : '\n自检通过：数据库读写、并发版本与留痕均可用')
console.log('CLEANUP_MARKER=' + marker)
if (failures.length) process.exitCode = 1
