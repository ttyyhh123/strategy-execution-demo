import { blankForm, clone, goals, makeId } from './domain.js'
import { projectTypes, typeFields, typeOf } from './agentPolicy.js'

export function makeDraft(project) {
  if (!project) return { ...blankForm(), category: '', goalId: '', startDate: '', application: { type: '' } }
  const { name, goalId, commitment, description, startDate, materials, milestones, application } = project
  const type = typeOf(project)
  return clone({ name, category: projectTypes[type], goalId, commitment, description, startDate, materials,
    milestones: milestones.map(({ id, name, planned, dependsOn }) => ({ id, name, planned, dependsOn })), application: { ...application, type } })
}

export function chooseType(draft, type) {
  draft.application.type = type
  draft.category = projectTypes[type]
  draft.goalId = goals[type === 'product' ? 0 : 1].id
}

export const applicationFields = draft => [
  { key: 'name', label: '项目名称', prompt: '这个项目叫什么？' },
  { key: 'description', label: draft.application.type === 'research' ? '技术问题' : '客户需求', prompt: '请描述项目想解决的问题。' },
  ...(draft.application.type === 'product' ? [{ key: 'commitment', label: '承诺收入（万元）', numeric: true, prompt: '预计可带来多少万元收入？' }] : []),
  ...(typeFields[draft.application.type] || []).map(field => ({ ...field, group: 'application' })),
  { key: 'startDate', label: '项目起始日期', date: true, prompt: '计划哪天启动？请使用 YYYY-MM-DD。' },
]

export function nextQuestion(draft) {
  if (!draft.application.type) return { key: 'type', prompt: '先选项目类型。它决定要补齐的字段和材料。' }
  const empty = applicationFields(draft).find(field => String((field.group ? draft[field.group] : draft)[field.key] ?? '').trim() === '')
  if (empty) return empty
  if (!draft.milestones.some(item => item.name && item.planned)) return { key: 'milestone', prompt: '请给我一个里程碑和计划日期，例如「客户试用验收 2026-11-20」。' }
  if (!draft.materials.some(item => item.title && item.body)) return { key: 'material', prompt: '请贴上材料正文或添加附件。' }
  return null
}

export function parseAnswer(draft, field, value) {
  if (field.key === 'type') {
    const type = /技术|研究/u.test(value) ? 'research' : /产品|开发/u.test(value) ? 'product' : ''
    if (!type) return false
    chooseType(draft, type)
    return true
  }
  if (field.key === 'milestone') {
    const match = value.match(/^(.+?)\s*[,，：:]?\s*(\d{4}-\d{2}-\d{2})$/u)
    if (!match) return false
    draft.milestones.push({ id: makeId('milestone'), name: match[1].trim(), planned: match[2], dependsOn: '' })
    return true
  }
  if (field.key === 'material') {
    const match = value.match(/^([^：:\n]{1,45})[：:]\s*(.+)$/su)
    draft.materials.push({ id: makeId('file'), title: match?.[1] || '支持材料', body: match?.[2] || value })
    return true
  }
  let parsed = value
  if (field.numeric) {
    const match = value.match(/^(-?\d+(?:\.\d+)?)\s*(?:万元|万)?$/u)
    if (!match) return false
    parsed = Number(match[1])
  }
  if (field.date && !/^\d{4}-\d{2}-\d{2}$/u.test(parsed)) return false
  const target = field.group ? draft[field.group] : draft
  target[field.key] = parsed
  return true
}

export function fillProductExample(draft) {
  const form = makeDraft()
  chooseType(form, 'product')
  Object.assign(form, {
    name: '远程诊断模块', description: '客户希望远程定位设备故障，减少现场排查时间。', commitment: 300, startDate: '2026-11-01',
    milestones: [{ id: 'trial', name: '客户试用验收', planned: '2026-11-20', dependsOn: '' },
      { id: 'release', name: '量产评审', planned: '2026-11-30', dependsOn: 'trial' }],
    materials: [{ id: 'sample-intent', title: '客户试用沟通纪要（样例）', body: '客户已表达试用意向，试用时间有待确认。' }],
  })
  form.application.investment = 120
  Object.assign(draft, form)
}
