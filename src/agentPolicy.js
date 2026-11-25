import { canRead, cleanForm, delayThreshold, goalFor, goalTotals, goals, inspectDelay, inspectSubmission, money, percentage, reviewRule, roles } from './domain.js'

export const policyVersion = 'Demo 0.2'
export const projectTypes = { product: '产品开发类', research: '技术研究类' }
export const knowledge = [
  { id: 'MB-01', title: '年度目标', text: '2026 年新产品收入目标为 1,000 万元。技术研究类在演示中关联技术能力建设目标。', type: '全部' },
  { id: 'TZ-01', title: '投资指引', text: '产品开发类展示演示回报率，计算口径为（承诺收入 − 投资额）÷ 投资额。技术研究类说明技术增量、验证标准及复用对象。', type: '全部' },
  { id: reviewRule.id, title: reviewRule.title, text: reviewRule.text, type: '产品开发类' },
  { id: 'ZR-02', title: '技术研究准入', text: '说明待解决技术问题、创新点、验证方法与复用计划。验证材料要写清验证对象、方法与通过标准。', type: '技术研究类' },
  { id: 'MB-02', title: '申报模板', text: '提供项目名称、目标、项目起始日期、至少一个带计划日期的里程碑、类型专项字段与支持材料。', type: '全部' },
  { id: 'FL-01', title: '分类分级与审批路径', text: '以项目目的区分产品开发、技术研究。两类暂进入产品线审批人队列。正式审批分流和项目分级待确认。', type: '全部' },
  { id: 'PS-01', title: '评审标准', text: '核对申报字段、附件证据与准入条款。申报校验通过后，经负责人确认送审，由审批人作出决定。', type: '全部' },
  { id: 'YJ-01', title: '延期触发与升级', text: '未完成里程碑预计延期超过 5 个自然日触发。演示将 6–10 天标为关注，11 天及以上标为较高，升级由负责人线下确认。', type: '全部' },
]

export const typeFields = {
  product: [
    { key: 'investment', label: '投资额（万元）', numeric: true, prompt: '预计投入多少万元？' },
  ],
  research: [
    { key: 'innovation', label: '技术创新点', prompt: '相较现有方案有哪些技术创新？' },
    { key: 'validation', label: '验证方案', prompt: '你打算怎样验证，什么结果算通过？' },
    { key: 'reuse', label: '复用计划', prompt: '成果会复用到哪些项目或产品？' },
  ],
}

export const typeOf = form => form?.application?.type || (form?.category === projectTypes.research ? 'research' : 'product')
export const policySource = id => knowledge.find(item => item.id === id)
export const approvalRoute = () => ({ role: 'approver', label: roles.approver.label, name: roles.approver.name, source: 'FL-01' })
export const riskLevel = days => days > 10 ? '较高' : days > delayThreshold ? '关注' : '未达阈值'
export const roi = form => Number(form.application?.investment) > 0 && form.commitment !== '' && Number.isFinite(Number(form.commitment))
  ? percentage(Number(form.commitment) - Number(form.application.investment), Number(form.application.investment)) : '—'

function matchingRule(question, type) {
  if (/延[期误]|预警|升级/u.test(question)) return ['YJ-01']
  if (/(?:怎么|如何)(?:发起|申请)?(?:立项|申报)|(?:申报|立项)(?:步骤|流程)|(?:立项|申报)(?:怎么|如何)(?:办|开始|做)/u.test(question)) return ['MB-02', 'PS-01']
  if (/审批|分级|分类/u.test(question)) return ['FL-01', 'PS-01']
  if (/准入|规则|条件|材料|附件|试用|验证/u.test(question)) {
    const research = /技术|研究/u.test(question)
    const product = /试用|产品/u.test(question)
    return [...(research || (!product && type !== 'product') ? ['ZR-02'] : []),
      ...(product || (!research && type !== 'research') ? [reviewRule.id] : []), 'MB-02']
  }
  if (/投资|预算|回报|ROI|收入|目标/iu.test(question)) return ['MB-01', 'TZ-01']
  if (/评审|审查|核查/u.test(question)) return ['PS-01']
  return []
}

export function answerPolicy(question, type) {
  const rules = matchingRule(question, type).map(policySource)
  return {
    text: rules.length ? rules.map(rule => rule.text).join('\n') : '知识库里暂时没有匹配的条款。可以问我年度目标、投资回报、立项材料、审批路径或延期预警。',
    sources: rules.map(rule => ({ label: rule.id + ' · ' + rule.title, rule: rule.id })),
  }
}

export function checkApplication(form) {
  const issues = []
  const add = (level, source, message, evidence) => issues.push({ level, source, message, evidence })
  const type = typeOf(form)
  try { cleanForm(form, true) } catch (error) { add('待补齐', 'MB-02', error.message) }
  if (!Object.hasOwn(projectTypes, type) || form.category !== projectTypes[type]) {
    add('禁止提交', 'FL-01', '请选择有效的项目类型。')
    return issues
  }
  if (form.goalId !== (type === 'product' ? 'new-product-2026' : 'technical-capability-2026')) {
    add('禁止提交', 'MB-01', '所选年度目标与项目类型不匹配。')
  }
  for (const field of typeFields[type]) {
    const value = form.application?.[field.key]
    if (value == null || String(value).trim() === '') add('待补齐', type === 'product' ? 'TZ-01' : 'ZR-02', '请补充' + field.label + '。')
    else if (field.numeric && (!Number.isFinite(Number(value)) || Number(value) <= 0)) add('禁止提交', 'TZ-01', '投资额须为大于 0 的数字。')
  }
  const attachments = form.materials.filter(item => item.title.trim() && item.body.trim())
  if (type === 'product') {
    const result = inspectSubmission({ ...form, description: '', materials: attachments })
    if (result.status === 'met') add('通过', reviewRule.id, '材料包含客户明确确认参加试用的表述。', result.evidence)
    else add(result.status === 'missing' ? '待补齐' : '禁止提交', reviewRule.id, result.suggestion, result.evidence)
  } else {
    const evidence = attachments.find(item => /验证|测试|实验/u.test(item.body) && /标准|通过|达标|阈值/u.test(item.body))
    if (evidence) add('通过', 'ZR-02', '验证材料包含方法及通过标准的相关表述，请核对原文。', {
      id: evidence.id, title: evidence.title, text: evidence.body.split('\n').find(line => /标准|通过|达标|阈值/u.test(line)).trim(),
    })
    else add(attachments.length ? '人工核实' : '待补齐', 'ZR-02', '请补充带有验证方法和通过标准的材料。')
  }
  return issues
}

export function blockingIssues(issues) {
  return issues.filter(issue => issue.level !== '通过')
}

export function reviewSubmission(form) {
  if (!form.application) return inspectSubmission(form)
  const issues = checkApplication(form)
  return { issues, policyVersion, route: approvalRoute(), status: blockingIssues(issues).length ? 'insufficient' : 'met' }
}

export function reviewFindings(result) {
  if (!result) return []
  if (result.issues) return result.issues
  const levels = { met: '通过', insufficient: '证据不足', missing: '缺失' }
  return [{ title: '客户试用说明', level: levels[result.status], source: result.ruleId, message: result.suggestion, evidence: result.evidence }]
}

const reviewTopics = [
  ['strategy', /年度目标|战略|目标匹配/u],
  ['finance', /投资|预算|回报|ROI|收入|收益/iu],
  ['research', /创新|复用|验证方案|技术方案/u],
  ['plan', /里程碑|排期|项目计划|验收安排/u],
  ['evidence', /原文|依据|证据|条款/u],
  ['gaps', /缺口|缺项|补件|补充材料|缺什么|漏了/u],
  ['decision', /核实|风险|决定|批准|退回|关注|建议|能否立项/u],
]
const reviewTopic = (question = '') => reviewTopics.find(([, pattern]) => pattern.test(question))?.[0]

function reviewRuleSource(id) {
  const rule = policySource(id)
  return { label: rule.id + ' · ' + rule.title, rule: rule.id }
}

export function askReview(projects, role, id, number, question, history = []) {
  const project = role === 'approver' && projects.find(item => item.id === id && canRead(item, role))
  const version = project && project.versions.find(item => item.number === number)
  if (!version) return { text: '当前角色无法查看该申报版本。' }
  const { form, ai } = version
  const type = typeOf(form)
  const goal = goalFor(form.goalId)
  const brief = { label: '任务书 · v' + number, file: 'brief' }
  const followUp = /再说|具体说|具体一点|再详细|展开|刚才|上一条|这一点/u.test(question)
  const prior = followUp ? history.findLast(item => item.role === 'user' && reviewTopic(item.text))?.text : ''
  const topic = reviewTopic(question) || reviewTopic(prior)

  if (topic === 'finance') {
    if (type === 'research') return { text: '技术研究类项目重点评估创新、验证与复用。请结合验证方案判断投入是否匹配预期成果。', sources: [reviewRuleSource('TZ-01')] }
    const investment = Number(form.application?.investment)
    const commitment = form.commitment !== '' && form.commitment != null && Number.isFinite(Number(form.commitment))
    const figures = '本版申报承诺收入 ' + (commitment ? money(form.commitment) : '未填写') + '，投资额 ' + (investment > 0 ? money(investment) : '未填写') + '。'
    const estimatedRoi = commitment ? roi(form) : '—'
    return {
      text: figures + (estimatedRoi === '—' ? '\n数据不足，建议补充投资明细和收入测算口径。'
        : '\n按演示口径计算，预计投资回报率为 ' + estimatedRoi + '。请核实收入测算依据和成本范围。'),
      sources: [reviewRuleSource('TZ-01')],
    }
  }
  if (topic === 'research' && type === 'research') {
    return {
      text: typeFields.research.map(field => field.label + '：' + (form.application?.[field.key] || '未填写')).join('\n')
        + '\n评审时可核对验证指标是否可复现，以及是否已有明确的复用对象。',
      sources: [brief, reviewRuleSource('ZR-02')],
    }
  }
  if (topic === 'strategy') {
    return { text: (goal ? '本版申报关联「' + goal.name + '」。' + goal.guidance : '本版申报未关联可识别的年度目标。')
      + '\n请结合任务书核实项目产出与目标指标之间的关系。', sources: [brief, reviewRuleSource('MB-01')] }
  }
  if (topic === 'plan') {
    const milestones = form.milestones.map(item => item.name + ' · ' + item.planned)
    return { text: (milestones.length ? '本版申报的里程碑计划\n' + milestones.join('\n') : '本版申报尚未填写里程碑。')
      + '\n建议核实关键节点的验收标准、前置依赖和资源安排。', sources: [reviewRuleSource('MB-02')] }
  }
  if (followUp && !topic) return { text: '你想继续看材料缺口、评审依据，还是审批前需核实的问题？' }

  const overview = '「' + form.name + '」v' + number + ' · ' + (form.category || projectTypes[type])
    + (goal ? ' · ' + goal.name : '') + '\n本版提交 ' + form.materials.length + ' 份附件、' + form.milestones.length + ' 个里程碑。'
  if (ai.status !== 'done' || !ai.result) {
    const state = ai.status === 'failed' ? '预审核查未完成，可在材料核查中重试。' : '正在核查材料，当前可询问申报数据和里程碑。'
    return { text: question === '评审概览' ? overview + '\n' + state : state, sources: [brief] }
  }
  const issues = reviewFindings(ai.result)
  const blocks = blockingIssues(issues)
  const relevant = ['decision', 'gaps'].includes(topic) && blocks.length ? blocks : issues
  const findings = relevant.map(issue => {
    const quote = topic === 'evidence' && issue.evidence ? '\n材料摘录：' + issue.evidence.text : ''
    return issue.level + ' · ' + issue.message + quote
  })
  const status = blocks.length ? '预审发现 ' + blocks.length + ' 项需关注。' : '本版预审未发现阻断项。'
  const checks = blocks.length ? '请优先核实以上缺口，必要时要求补件。'
    : type === 'research' ? '建议核实验证标准是否可复现、复用对象是否明确。'
      : '建议核实客户确认材料、收入测算依据与关键里程碑的验收安排。'
  const issueSources = relevant.flatMap(issue => [
    ...(policySource(issue.source) ? [reviewRuleSource(issue.source)] : []),
    ...(issue.evidence ? [{ label: issue.evidence.title + ' · v' + number, file: issue.evidence.id, quote: issue.evidence.text }] : []),
  ])
  const lines = question === '评审概览' ? [overview, status, ...findings, checks] : [status, ...findings, ...(topic === 'evidence' ? [] : [checks])]
  const sources = [...new Map(issueSources.map(item => [item.rule || item.file + ':' + item.quote, item])).values()]
  return { text: lines.join('\n'), sources }
}

const riskTopics = [
  ['rule', /阈值|触发|怎么算|分级|升级|级别/u],
  ['cause', /原因|为什么/u],
  ['impact', /影响|下游|后续节点/u],
  ['treatment', /下一步|怎么办|处理|跟进|措施|协调/u],
]
const riskTopic = (question = '') => riskTopics.find(([, pattern]) => pattern.test(question))?.[0]

export function analyzeRisk(projects, role, projectId, alertId, question, history = []) {
  const project = projects.find(item => item.id === projectId && canRead(item, role) && ['active', 'closed'].includes(item.status))
  if (!project) return { text: '请选择有权查看的执行或结项项目。' }
  const followUp = /再说|具体说|具体一点|再详细|展开|刚才|上一条|这点|这一点/u.test(question)
  const priorQuestion = followUp ? history.findLast(message => message.role === 'user' && riskTopic(message.text))?.text : ''
  const topic = riskTopic(question) || riskTopic(priorQuestion)
  if (followUp && !topic) return { text: '你想具体了解延期原因、影响范围，还是下一步处理？' }
  const ruleSource = { label: 'YJ-01 · 阈值及分级', rule: 'YJ-01' }
  if (topic === 'rule') {
    return { text: policySource(ruleSource.rule).text, sources: [ruleSource] }
  }
  const alerts = project.alerts.filter(item => !alertId || item.id === alertId)
  if (!alerts.length) return { text: '当前范围内没有预警记录。系统在保存未完成里程碑且预计延期超过 5 天时生成预警。', sources: [{ label: '查看里程碑', href: '#/project/' + project.id + '/progress' }] }
  const open = alerts.filter(item => item.state !== 'closed')
  const selected = alertId ? alerts[0] : [...(open.length ? open : alerts)].sort((a, b) => b.delay - a.delay)[0]
  const milestone = project.milestones.find(item => item.id === selected.milestoneId)
  if (!milestone) return { text: '关联的里程碑记录已不可用，请查看项目原始记录。' }
  const input = { name: milestone.name, planned: selected.planned, forecast: selected.forecast, delay: selected.delay,
    note: selected.state === 'closed' ? '' : milestone.note,
    dependents: project.milestones.filter(item => item.dependsOn === milestone.id).map(item => item.name) }
  const result = inspectDelay(input)
  const record = { label: '查看进度记录', href: '#/project/' + project.id + '/progress?alert=' + selected.id }
  const outcome = selected.outcome ? '处理结果：' + selected.outcome : '这条预警已经关闭，记录里没有处理结果说明。'
  if (topic === 'cause') {
    const text = selected.state === 'closed' ? '这条预警已经关闭。可以回到进度记录，查阅当时的说明。'
      : input.note ? '最近的进度说明是：「' + input.note + '」可以据此向项目负责人核实延期原因。'
        : '进度记录里还没有填写延期原因。建议先向项目负责人核实阻塞点和最新预计日期。'
    return { text, sources: [record] }
  }
  if (topic === 'impact') {
    const text = input.dependents.length ? '根据当前里程碑依赖，「' + input.dependents.join('」「') + '」直接依赖「' + milestone.name + '」。建议先和这些节点的负责人确认排期。'
      : '当前记录里没有已登记的下游依赖。请核对项目计划，确认是否还有需要同步的节点。'
    return { text, sources: [record] }
  }
  if (topic === 'treatment') {
    if (selected.state === 'closed') return { text: outcome, sources: [record] }
    const treatment = selected.treatment
    const text = treatment ? '这条预警已有处理措施：' + treatment.measure + '\n责任人：' + treatment.assignee + '。截止日期：' + treatment.due + '。'
      : '建议先确认阻塞原因和最新预计完成日期，再和相关节点负责人同步排期。项目负责人可以在进度记录里登记措施、责任人和截止日期。'
    return { text, sources: [record] }
  }
  const summary = selected.state === 'closed' ? outcome : '按演示规则属于「' + riskLevel(selected.delay) + '」。'
  return { text: result.evidence + '\n' + summary, sources: [record, ruleSource] }
}

function metricTopic(question = '') {
  if (/风险|延期|预警/u.test(question)) return 'alerts'
  if (/项目达成率|贡献|结项|哪些项目/u.test(question)) return 'projects'
  if (/目标|收入|达成|缺口|差多少|进度|完成/u.test(question)) return 'annual'
  if (/项目/u.test(question)) return 'projects'
}

export function queryMetrics(projects, role, question, history = []) {
  if (role !== 'manager') return { text: '智能问数仅向管理层开放。' }
  const goal = goals[0]
  const followUp = /^(?:那|再|接着)|具体|怎么算|计算口径|刚才|上一条/u.test(question)
  const previous = followUp ? history.findLast(item => item.role === 'user' && metricTopic(item.text))?.text : ''
  const yearPattern = /\b20\d{2}\b/u
  const year = question.match(yearPattern)?.[0] || (!/今年|本年|本年度/u.test(question) && previous?.match(yearPattern)?.[0])
  if (year && Number(year) !== goal.year) return { text: '当前演示仅提供 ' + goal.year + ' 年度数据。' }
  const eligible = projects.filter(project => canRead(project, role) && project.goalId === goal.id)
  const { income, openAlerts } = goalTotals(eligible, goal)
  const topic = metricTopic(question) || metricTopic(previous) || (followUp ? 'annual' : '')
  if (topic === 'alerts') {
    return { text: '当前目标有 ' + openAlerts.length + ' 条未关闭预警。' + (openAlerts.length ? '\n' + openAlerts.map(({ project, alert }) => project.name + ' · 延期 ' + alert.delay + ' 天 · ' + riskLevel(alert.delay)).join('\n') : ''),
      sources: [{ label: '看板 · 未关闭预警', href: '#/dashboard/risks' }, ...openAlerts.map(({ project, alert }) => ({ label: project.name + ' · 预警详情', href: '#/risks/' + project.id + '?alert=' + encodeURIComponent(alert.id) }))] }
  }
  if (topic === 'projects') {
    const closed = eligible.filter(item => item.closing?.year === goal.year)
    const contributions = closed.map(item => item.name + '确认收入 ' + money(item.closing.amount) + '，项目达成率 ' + percentage(item.closing.amount, item.commitment) + '，年度目标贡献 ' + percentage(item.closing.amount, goal.amount) + '。')
    const formula = followUp && closed.length ? '\n项目达成率 = 确认收入 ÷ 该项目承诺收入。年度目标贡献 = 确认收入 ÷ 年度目标金额。' : ''
    return { text: (contributions.length ? contributions.join('\n') : '当前范围内暂无可计入年度目标的结项收入。') + formula,
      sources: [{ label: '看板 · 项目贡献明细', href: '#/dashboard/contributions' }, ...closed.map(item => ({ label: item.name + ' · 结项收入来源', href: '#/project/' + item.id + '/close' }))] }
  }
  if (topic === 'annual') {
    return { text: goal.year + ' 年度' + goal.name + ' ' + money(goal.amount) + '，已确认收入 ' + money(income) + '，达成率 ' + percentage(income, goal.amount) + '，距目标还差 ' + money(Math.max(0, goal.amount - income)) + '。\n口径：年度内有结项确认的实际收入 ÷ 年度目标金额。',
      sources: [{ label: '看板 · 年度收入指标', href: '#/dashboard/metrics' }] }
  }
  return { text: '当前可查询 ' + goal.year + ' 年度目标达成率、项目贡献和未关闭预警。' }
}
