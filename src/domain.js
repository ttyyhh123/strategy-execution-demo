export const roles = {
  owner: { label: '项目负责人', name: '周宁', home: '/projects' },
  approver: { label: '产品线审批人', name: '许晨', home: '/approvals' },
  manager: { label: '管理层', name: '林衡', home: '/dashboard' },
}

export const projectStates = {
  draft: '草稿',
  pending: '待审批',
  returned: '退回补件',
  active: '执行中',
  closed: '已结项',
}
export const alertStates = { open: '待处理', working: '处理中', closed: '已关闭' }
export const aiStates = { processing: '处理中', done: '已完成', failed: '未完成' }
export const projectId = 'remote-diagnostics'
export const delayThreshold = 5
export const reviewRule = {
  id: 'ZR-01',
  title: '客户试用准入条款',
  version: '2026.1',
  text: '立项申请应提供客户确认参加项目试用的书面说明。仅表达兴趣或试用意向时，需补充明确的参加确认。',
}
export const goals = [{
  id: 'new-product-2026',
  name: '新产品收入目标',
  year: 2026,
  amount: 1000,
  guidance: '优先支持可验证客户需求并具备试用计划的工业设备产品项目。',
}]

const DAY = 86400000
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: 'Asia/Shanghai',
})
const amountFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export const clone = value => JSON.parse(JSON.stringify(value))
export const makeId = prefix => prefix + '-' + crypto.randomUUID()
export const now = () => new Date().toISOString()
export const currentVersion = project => project.versions.at(-1)
export const money = value => value === undefined || value === null ? '—' : amountFormat.format(value) + ' 万元'
export const dateTime = date => date ? dateFormat.format(new Date(date)) : '—'
export const percentage = (value, total) => total > 0 ? amountFormat.format(value / total * 100) + '%' : '—'
export const goalFor = id => goals.find(goal => goal.id === id)
export const daysBetween = (later, earlier) => Math.round((Date.parse(later) - Date.parse(earlier)) / DAY)
export const delayDays = (forecast, planned) => Math.max(0, daysBetween(forecast, planned))
export const dayLabel = (date, start) => date ? '第 ' + (daysBetween(date, start) + 1) + ' 天' : '—'
export const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function canRead(project, role) {
  if (!project) return false
  if (role === 'owner') return project.ownerId === role
  if (role === 'approver') return project.status === 'pending' || project.reviews.length > 0
  return role === 'manager' && ['active', 'closed'].includes(project.status)
}

export function canEdit(project, role) {
  return role === 'owner' && (!project || (project.ownerId === role && ['draft', 'returned'].includes(project.status)))
}

export function projectFiles(form) {
  return [{ id: 'brief', title: '任务书', body: form.description }, ...form.materials]
}

export function inspectSubmission(form) {
  const files = projectFiles(form)
  const lines = files.flatMap(file => file.body.split(/\n|(?<=。|！|？)/u).map(text => ({
    id: file.id, title: file.title, text: text.trim(),
  }))).filter(line => line.text)
  const confirmed = lines.find(line => /客户.*(已确认|明确同意).*(参加|参与|接受|开展)?.*试用/u.test(line.text)
    && !/未确认|尚未|不参加|不同意|未同意|不能/u.test(line.text))
  const intent = lines.find(line => /客户.*(试用|意向)/u.test(line.text))
  const status = confirmed ? 'met' : intent ? 'insufficient' : 'missing'
  return {
    status,
    ruleId: reviewRule.id,
    evidence: confirmed || intent || null,
    suggestion: confirmed ? '材料包含客户明确确认参加试用的表述。'
      : intent ? '请补充客户明确确认参加试用的书面说明。' : '请提交客户试用确认材料。',
  }
}

export function inspectDelay(input) {
  return {
    impact: input.dependents.length
      ? '请核对' + input.dependents.join('、') + '的排期。以下游节点确认的时间为准。'
      : '后续依赖待确认。请核对项目计划及受影响范围。',
    cause: input.note || '待确认。当前进度说明未记录延期原因。',
    evidence: input.name + '，原计划 ' + input.planned + '，预计 ' + input.forecast + '，延期 ' + input.delay + ' 天。',
    suggestion: '先确认客户可试用时间，更新里程碑预计日期，并与后续节点负责人同步。',
  }
}

export function blankForm() {
  return {
    name: '', category: '产品研发', goalId: goals[0].id,
    commitment: '', description: '', startDate: '2026-11-01',
    materials: [], milestones: [],
  }
}

const sampleMaterial = {
  id: 'customer-trial', title: '客户试用说明',
  body: '一、试用目的\n验证远程诊断模块在客户实际业务场景中的可用性与价值，为后续推广提供依据。\n\n二、试用安排\n试用周期为 4 周，覆盖设备接入、远程诊断、问题定位与报告输出等核心功能。\n客户已确认参加远程诊断模块试用。\n\n三、试用条件\n客户符合试用准入条款，包括具备必要的设备条件、配合完成试用反馈，并同意试用数据用于方案评估。',
}

export function seedScenario(scenario) {
  const form = {
    ...blankForm(),
    name: '远程诊断模块',
    startDate: '2026-11-01',
    commitment: 300,
    description: '项目面向设备制造客户。客户已表达试用意向，项目组计划验证设备接入和远程诊断能力。',
    milestones: [
      { id: 'trial', name: '客户试用验收', planned: '2026-11-20', dependsOn: '' },
      { id: 'release', name: '量产评审', planned: '2026-11-30', dependsOn: 'trial' },
    ],
  }
  const project = {
    id: projectId, ...clone(form), ownerId: 'owner', status: 'draft', versions: [], reviews: [],
    milestones: form.milestones.map(milestone => ({ ...milestone, forecast: milestone.planned, actual: '', note: '' })),
    alerts: [], closing: null, createdAt: '2026-11-19T01:00:00Z',
  }
  if (scenario === 'flow') return { projects: [project], simulateAiFailure: false }
  const second = { ...clone(form), materials: [sampleMaterial] }
  return {
    simulateAiFailure: false,
    projects: [{
      ...project,
      ...clone(second),
      status: 'pending',
      milestones: project.milestones,
      versions: [
        { number: 1, submittedAt: '2026-11-20T01:00:00Z', form: clone(form),
          ai: { status: 'done', result: inspectSubmission(form), finishedAt: '2026-11-20T01:02:00Z' } },
        { number: 2, submittedAt: '2026-11-22T01:00:00Z', form: second,
          ai: { status: 'done', result: inspectSubmission(second), finishedAt: '2026-11-22T01:02:00Z' } },
      ],
      reviews: [{ number: 1, action: 'return', reason: '补充客户明确确认参加试用的说明。', by: roles.approver.name, at: '2026-11-20T02:00:00Z' }],
    }],
  }
}

export function cleanForm(input, submitting) {
  const form = clone(input)
  form.name = form.name.trim()
  form.description = form.description.trim()
  form.commitment = form.commitment === '' ? '' : Number(form.commitment)
  const goal = goalFor(form.goalId)
  if (!form.name) throw new Error('请输入项目名称。')
  if (!goal) throw new Error('请选择年度目标。')
  form.materials = form.materials.map(material => ({ ...material, title: material.title.trim(), body: material.body.trim() }))
    .filter(material => material.title || material.body)
  form.milestones = form.milestones.map(milestone => ({ ...milestone, name: milestone.name.trim() }))
  if (!submitting) return form
  if (!form.category || !form.description.trim()) throw new Error('请填写项目类别和客户需求。')
  if (!Number.isFinite(form.commitment) || form.commitment <= 0) throw new Error('承诺收入须大于 0 万元。')
  if (!form.startDate || Number(form.startDate.slice(0, 4)) !== goal.year) throw new Error('项目起始日期须与目标年度一致。')
  if (form.materials.some(material => !material.title || !material.body)) throw new Error('每份材料需填写名称与正文。')
  if (!form.milestones.length || form.milestones.some(milestone => !milestone.name || !milestone.planned)) {
    throw new Error('至少填写一个里程碑，补齐各里程碑的名称和计划日期。')
  }
  const positions = new Map(form.milestones.map((milestone, index) => [milestone.id, index]))
  if (form.milestones.some((milestone, index) => milestone.planned < form.startDate ||
    (milestone.dependsOn && !(positions.get(milestone.dependsOn) < index)))) {
    throw new Error('里程碑计划须在项目起始日或之后，前置节点须选上一行或更早的里程碑。')
  }
  return form
}

export function goalTotals(projects, goal) {
  const matching = projects.filter(project => project.goalId === goal.id)
  const income = matching.reduce((sum, project) => project.closing?.year === goal.year
    ? sum + Math.round(project.closing.amount * 100) : sum, 0) / 100
  const openAlerts = matching.flatMap(project => project.alerts.map(alert => ({ project, alert })))
    .filter(({ alert }) => alert.state !== 'closed')
  return { income, openAlerts }
}
