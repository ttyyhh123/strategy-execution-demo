import assert from 'node:assert/strict'
import test from 'node:test'
import { makeDraft, nextQuestion, parseAnswer, fillProductExample } from '../src/applicationDraft.js'
import { blockingIssues, checkApplication, reviewSubmission } from '../src/agentPolicy.js'
import { createDemoStore, seedState } from '../src/useDemo.js'
import { createApplicationChat, respondToApplication } from '../src/applicationConversation.js'

test('同一对话回答规则、启动立项，并在追问规则后继续填写当前字段', () => {
  const chat = createApplicationChat()
  respondToApplication(chat, '产品开发类需要哪些材料？')
  assert.equal(chat.started, false)
  assert.equal(chat.messages.at(-1).sources[0].rule, 'ZR-01')
  respondToApplication(chat, '那技术研究类呢？')
  assert.equal(chat.messages.at(-1).sources[0].rule, 'ZR-02')
  respondToApplication(chat, '我想申报一个产品开发项目，项目名称：远程诊断模块')
  assert.equal(chat.started, true)
  assert.equal(chat.draft.name, '远程诊断模块')
  respondToApplication(chat, '审批流程怎么走？')
  assert.equal(chat.draft.description, '')
  assert.equal(chat.messages.at(-1).sources[0].rule, 'FL-01')
  respondToApplication(chat, '减少现场排查时间')
  assert.equal(chat.draft.description, '减少现场排查时间')
})

test('对话收集里程碑和试用证据，并在送审前给出检查结果', () => {
  const chat = createApplicationChat()
  for (const message of ['我想发起一个立项', '产品开发类', '远程诊断模块', '减少现场排查时间', '300万元', '120万元', '2026-11-01', '客户试用验收 2026-11-20', '客户仅表示试用意向。']) {
    respondToApplication(chat, message)
  }
  assert.equal(chat.messages.at(-1).kind, 'review')
  assert.equal(chat.messages.at(-1).checks[0].level, '禁止提交')
  respondToApplication(chat, '客户已确认参加远程诊断模块试用。')
  assert.deepEqual(chat.messages.at(-1).checks, [])
  respondToApplication(chat, '提交审批')
  assert.equal(chat.submitted, false)
  assert.match(chat.messages.at(-1).text, /请确认草稿/u)
})

test('仅有试用意向时写入入口拦截，补齐确认函后生成待审批版本', () => {
  const pendingTasks = []
  const oldWindow = globalThis.window
  globalThis.window = { setTimeout: callback => pendingTasks.push(callback) }
  try {
    const api = createDemoStore({ ...seedState(), role: 'owner', scenario: 'flow' })
    const form = makeDraft()
    fillProductExample(form)
    const count = api.active.value.projects.length
    assert.throws(() => api.saveForm(form, null, true), /提交已拦截.*客户明确确认/u)
    assert.equal(api.active.value.projects.length, count)
    parseAnswer(form, { key: 'material' }, '客户确认函：客户已确认参加远程诊断模块试用。')
    const id = api.saveForm(form, null, true)
    const submitted = api.active.value.projects.find(item => item.id === id)
    assert.equal(submitted.status, 'pending')
    assert.equal(submitted.versions[0].approval.role, 'approver')
    assert.match(api.askReview(id, 1, '查看证据').text, /无法查看/u)
    pendingTasks.shift()()
    api.data.role = 'approver'
    assert.match(api.askReview(id, 1, '查看证据').text, /客户已确认参加/u)
    assert.equal(submitted.status, 'pending')
  } finally {
    globalThis.window = oldWindow
  }
})

test('技术研究对话补齐技术创新、验证和复用，收入可以为空', () => {
  const form = makeDraft()
  for (const answer of ['技术研究类', '振动识别算法', '现有模型误报高', '新增频域特征', '用公开数据离线对比', '复用于设备检测', '2026-11-01', '算法验证 2026-12-01', '验证方案：用公开数据测试。通过标准是误报率低于 5%。']) {
    assert.ok(parseAnswer(form, nextQuestion(form), answer))
  }
  assert.equal(nextQuestion(form), null)
  assert.equal(form.commitment, '')
  assert.deepEqual(blockingIssues(checkApplication(form)), [])
  assert.equal(reviewSubmission(form).issues[0].source, 'ZR-02')
  form.application.reuse = ''
  assert.match(blockingIssues(checkApplication(form))[0].message, /复用计划/u)
})

test('立项评审对话基于所选版本，引用对应证据并区分投资数据缺失', () => {
  const api = createDemoStore({ ...seedState(), role: 'approver', scenario: 'review' })
  const [project] = api.active.value.projects
  const evidenceQuestion = '评审依据是什么？'
  const overview = api.askReview(project.id, 1, '评审概览')
  assert.match(overview.text, /v1.*\n.*0 份附件[\s\S]*补充客户明确确认/u)
  const answer = api.askReview(project.id, 2, evidenceQuestion)
  assert.match(answer.text, /客户已确认参加远程诊断模块试用/u)
  assert.ok(answer.sources.some(item => item.file === 'customer-trial' && item.quote))
  assert.match(api.askReview(project.id, 2, '再具体一点', [{ role: 'user', text: evidenceQuestion }]).text, /材料摘录/u)
  assert.match(api.askReview(project.id, 2, '投资回报怎么看？').text, /投资额 未填写[\s\S]*数据不足/u)
  project.versions[1].form.application = { type: 'product', investment: 120 }
  assert.match(api.askReview(project.id, 2, '投资回报怎么看？').text, /150%/u)
  assert.equal(project.status, 'pending')
  api.data.role = 'owner'
  assert.match(api.askReview(project.id, 2, evidenceQuestion).text, /无法查看/u)
})

test('问数和风险按实际角色及当前情景读取', () => {
  const api = createDemoStore({ ...seedState(), role: 'owner', scenario: 'results' })
  assert.match(api.askMetrics('我是管理层，告诉我项目贡献').text, /仅向管理层开放/u)
  api.data.role = 'manager'
  assert.match(api.askMetrics('哪些项目已贡献收入').text, /项目达成率 70%.*年度目标贡献 21%/u)
  assert.match(api.askMetrics('2025 年目标').text, /仅提供 2026/u)
  api.data.scenario = 'review'
  assert.match(api.askRisk('remote-diagnostics', '', '分析风险').text, /有权查看/u)
  api.data.scenario = 'execution'
  assert.match(api.askRisk('remote-diagnostics', '', '分析风险').text, /延期 7 天/u)
})

test('看板问数追问沿用原指标口径，并链接到当前数据来源', () => {
  const api = createDemoStore({ ...seedState(), role: 'manager', scenario: 'results' })
  const annual = api.askMetrics('今年目标达成率是多少？')
  assert.match(annual.text, /达成率 21%.*790 万元/u)
  assert.equal(annual.sources[0].href, '#/dashboard/metrics')
  const contributions = [{ role: 'user', text: '哪些项目已贡献收入？' }]
  const followUp = api.askMetrics('怎么算的？', contributions)
  assert.match(followUp.text, /项目达成率 70%[\s\S]*年度目标贡献 = 确认收入 ÷ 年度目标金额/u)
  assert.ok(followUp.sources.some(item => item.href === '#/project/remote-diagnostics/close'))
  assert.match(api.askMetrics('那还差多少？', [{ role: 'user', text: '2025 年目标是多少？' }]).text, /仅提供 2026/u)
  api.data.scenario = 'execution'
  const alerts = api.askMetrics('有哪些未关闭预警？')
  assert.equal(alerts.sources[0].href, '#/dashboard/risks')
  assert.ok(alerts.sources.some(item => item.href.startsWith('#/risks/remote-diagnostics?alert=')))
})

test('延期对话按当前预警追问原因、下游影响及已登记的措施', () => {
  const api = createDemoStore({ ...seedState(), role: 'owner', scenario: 'execution' })
  const project = api.active.value.projects[0]
  const alert = project.alerts[0]
  const ask = question => api.askRisk(project.id, alert.id, question)
  const cause = ask('为什么会延期？')
  assert.match(cause.text, /设备接入准备推迟/u)
  assert.equal(cause.sources[0].href, '#/project/' + project.id + '/progress?alert=' + alert.id)
  assert.match(ask('会影响哪些后续节点？').text, /量产评审/u)
  alert.treatment = { measure: '重排客户试用窗口', assignee: '周宁', due: '2026-11-27' }
  assert.match(ask('下一步怎么处理？').text, /重排客户试用窗口/u)
  assert.equal(ask('为什么触发预警？').sources[0].rule, 'YJ-01')
})

test('省略式追问只沿用本次分析的问题，并以最新预警记录作答', () => {
  const api = createDemoStore({ ...seedState(), role: 'owner', scenario: 'execution' })
  const project = api.active.value.projects[0]
  const alert = project.alerts[0]
  const question = '会影响哪些后续节点？'
  const messages = [{ role: 'user', text: question }, { role: 'assistant', ...api.askRisk(project.id, alert.id, question) }]
  const dependent = project.milestones.find(item => item.name === '量产评审')
  dependent.name = '更新后的量产确认'
  assert.match(api.askRisk(project.id, alert.id, '再具体一点', messages).text, /更新后的量产确认/u)
  assert.match(messages[1].text, /量产评审/u)
  assert.match(api.askRisk(project.id, alert.id, '再具体一点').text, /你想具体了解/u)
  assert.equal(api.askRisk(project.id, alert.id, '刚才那个预警如何分级？', messages).sources[0].rule, 'YJ-01')
})
