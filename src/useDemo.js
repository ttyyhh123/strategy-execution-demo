import { computed, nextTick, reactive, ref, watch } from 'vue'
import {
  canEdit, canRead, cleanForm, clone, currentVersion, delayDays, delayThreshold, goalFor,
  inspectDelay, makeId, now, roles, seedScenario, seedOperations,
} from './domain.js'
import { analyzeRisk, approvalRoute, askReview, blockingIssues, checkApplication, policyVersion, queryMetrics, reviewSubmission } from './agentPolicy.js'

const storageKey = 'strategy-execution-demo-assistants-v2'
const previousStorageKey = 'strategy-execution-demo-v1'

export function seedState() {
  return { flow: seedScenario('flow'), review: seedScenario('review'), role: 'approver', scenario: 'review' }
}

export function normalizeState(input) {
  const state = input && typeof input === 'object' ? input : {}
  const valid = state.flow?.projects && state.review?.projects
  const source = valid ? state : seedState()
  return {
    flow: clone(source.flow),
    review: clone(source.review),
    execution: clone(source.execution || seedOperations()),
    results: clone(source.results || seedOperations(true)),
    role: roles[source.role] ? source.role : 'approver',
    scenario: ['flow', 'review', 'execution', 'results'].includes(source.scenario) ? source.scenario : 'review',
  }
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(previousStorageKey))
    if (saved?.flow?.projects && saved?.review?.projects) return saved
  } catch { /* A fresh demo remains usable when browser storage is unavailable. */ }
  return { ...seedState(), role: 'owner', scenario: 'flow' }
}

const projectHref = (id, tab, version) => '#/project/' + id + '/' + tab + (version ? '?v=' + version : '')

/**
 * 业务状态的唯一实现。数据源由调用方注入：
 * useDemo 走浏览器存储（离线与自动化测试），cloudStore 走云数据库。
 */
export function createDemoStore(initialState, options = {}) {
  const data = reactive(normalizeState(initialState))
  let suspend = 0
  const active = computed(() => data[data.scenario])
  const readable = computed(() => active.value.projects.filter(project => canRead(project, data.role)))

  watch(data, value => {
    if (suspend > 0) return
    options.onChange?.(JSON.parse(JSON.stringify(value)))
  }, { deep: true })

  function record(action, extra = {}) {
    options.onAction?.({ action, actor: roles[data.role].name, ...extra })
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(data))
  }

  /** 用云端数据替换本地状态时，不触发一次回写，避免覆盖别人的更新。 */
  function applyRemote(next) {
    const normalized = normalizeState(next)
    suspend += 1
    data.flow = normalized.flow
    data.review = normalized.review
    data.execution = normalized.execution
    data.results = normalized.results
    data.role = normalized.role
    data.scenario = normalized.scenario
    nextTick(() => { suspend -= 1 })
  }

  function requireScope(project, state, role) {
    if (data.role !== role || !canRead(project, role) || (state && project.status !== state)) {
      throw new Error('当前角色或项目状态无法执行此操作。请刷新后重试。')
    }
  }

  function finishTask(task, produce) {
    window.setTimeout(() => {
      if (task.status !== 'processing') return
      if (task.willFail) {
        task.status = 'failed'
        task.error = '模拟调用失败。可以重试，也可依据原文人工处理。'
        return
      }
      task.result = produce()
      task.status = 'done'
      task.finishedAt = now()
    }, 850)
  }

  function queue(task, produce, scenarioState = active.value) {
    task.status = 'processing'
    task.error = ''
    task.willFail = scenarioState.simulateAiFailure
    scenarioState.simulateAiFailure = false
    finishTask(task, produce)
  }

  for (const scenarioState of [data.flow, data.review, data.execution, data.results]) {
    for (const project of scenarioState.projects) {
      for (const version of project.versions) {
        if (version.ai.status === 'processing') finishTask(version.ai, () => reviewSubmission(version.form))
      }
      for (const alert of project.alerts) {
        for (const task of alert.analyses) {
          if (task.status === 'processing') finishTask(task, () => inspectDelay(task.input))
        }
      }
      if (project.status === 'active') {
        const recordedMilestones = new Set(project.alerts.map(alert => alert.milestoneId))
        for (const milestone of project.milestones) {
          const delay = delayDays(milestone.forecast, milestone.planned)
          if (!milestone.actual && delay > delayThreshold && !recordedMilestones.has(milestone.id)) {
            createDelayAlert(project, milestone, delay, scenarioState)
          }
        }
      }
    }
  }

  function saveForm(input, id, submitting) {
    let project = active.value.projects.find(item => item.id === id)
    if ((id && !project) || !canEdit(project, data.role)) throw new Error('当前项目无法编辑。')
    if (submitting) {
      const blocking = blockingIssues(checkApplication(input))
      if (blocking.length) throw new Error('提交已拦截。' + blocking[0].message)
    }
    const form = cleanForm(input, submitting)
    if (!project) {
      const newId = makeId('project')
      active.value.projects.push({
        id: newId, ownerId: data.role, status: 'draft', versions: [], reviews: [],
        alerts: [], closing: null, createdAt: now(),
      })
      project = active.value.projects.at(-1)
    }
    Object.assign(project, form)
    if (submitting) {
      project.status = 'pending'
      project.versions.push({ number: project.versions.length + 1, submittedAt: now(), form: clone(form), ai: {}, approval: approvalRoute(), policyVersion })
      const version = currentVersion(project)
      queue(version.ai, () => reviewSubmission(version.form))
      record(version.number > 1 ? '提交补件' : '提交申请', {
        projectId: project.id, projectName: project.name, version: version.number,
        href: projectHref(project.id, 'review', version.number),
      })
    }
    return project.id
  }

  function decide(project, versionNumber, action, reason) {
    requireScope(project, 'pending', 'approver')
    const version = currentVersion(project)
    if (version.number !== versionNumber || project.reviews.some(item => item.number === versionNumber)) {
      throw new Error('此版本已处理，请打开最新提交版本。')
    }
    const note = (reason || '').trim()
    if (action === 'return' && !note) throw new Error('请填写退回原因。')
    project.reviews.push({ number: version.number, action, reason: note, by: roles.approver.name, at: now() })
    record(action === 'return' ? '退回补件' : '批准立项', {
      projectId: project.id, projectName: project.name, version: version.number,
      href: projectHref(project.id, 'review', version.number),
      detail: note || null,
    })
    if (action === 'return') {
      project.status = 'returned'
      return
    }
    project.status = 'active'
    project.approvedVersion = version.number
    project.milestones = version.form.milestones.map(item => ({ ...item, forecast: item.planned, actual: '', note: '' }))
  }

  function retryReview(project, version) {
    requireScope(project, 'pending', 'approver')
    if (version.number !== currentVersion(project).number || version.ai.status !== 'failed') {
      throw new Error('请在当前待审批版本中重试。')
    }
    queue(version.ai, () => reviewSubmission(version.form))
  }

  function analyze(project, alert) {
    requireScope(project, null, 'owner')
    startDelayAnalysis(project, alert, active.value)
  }

  function startDelayAnalysis(project, alert, scenarioState) {
    const milestone = project.milestones.find(item => item.id === alert.milestoneId)
    const previous = alert.analyses.at(-1)
    if (previous?.status === 'processing') throw new Error('正在分析当前记录，请稍候。')
    alert.analyses.push({
      id: makeId('analysis'),
      input: {
        name: milestone.name, planned: milestone.planned, forecast: milestone.forecast,
        delay: delayDays(milestone.forecast, milestone.planned), note: milestone.note,
        dependents: project.milestones.filter(item => item.dependsOn === milestone.id).map(item => item.name),
      },
    })
    const task = alert.analyses.at(-1)
    queue(task, () => inspectDelay(task.input), scenarioState)
  }

  function createDelayAlert(project, milestone, delay, scenarioState) {
    project.alerts.push({
      id: makeId('alert'), milestoneId: milestone.id, planned: milestone.planned,
      forecast: milestone.forecast, delay, state: 'open', createdAt: now(), analyses: [], treatment: null,
    })
    startDelayAnalysis(project, project.alerts.at(-1), scenarioState)
  }

  function updateSchedule(project, id, fields) {
    requireScope(project, 'active', 'owner')
    const milestone = project.milestones.find(item => item.id === id)
    if (!milestone) throw new Error('未找到该里程碑。')
    if (!fields.forecast || fields.forecast < project.startDate || (fields.actual && fields.actual < project.startDate)) {
      throw new Error('请填写预计日期，日期须在项目起始日或之后。')
    }
    const oldDelay = delayDays(milestone.forecast, milestone.planned)
    const previous = { forecast: milestone.forecast, actual: milestone.actual, note: milestone.note }
    milestone.history ||= []
    const next = { forecast: fields.forecast, actual: fields.actual, note: fields.note.trim() }
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      milestone.history.push({ ...next, at: now(), by: roles.owner.name })
    }
    Object.assign(milestone, next)
    record('更新里程碑进度', {
      projectId: project.id, projectName: project.name,
      href: projectHref(project.id, 'progress'),
      detail: milestone.name + ' · 预计 ' + milestone.forecast + (milestone.actual ? ' · 实际 ' + milestone.actual : ''),
    })
    const delay = delayDays(milestone.forecast, milestone.planned)
    const open = project.alerts.find(item => item.milestoneId === id && item.state !== 'closed')
    if (open) {
      open.delay = delay
      open.forecast = milestone.forecast
      return '已更新进度与预警记录'
    }
    const hasPreviousAlert = project.alerts.some(item => item.milestoneId === id)
    if (!milestone.actual && delay > delayThreshold && (oldDelay <= delayThreshold || !hasPreviousAlert)) {
      createDelayAlert(project, milestone, delay, active.value)
      return '已保存，产生 ' + delay + ' 天延期预警'
    }
    return '已保存里程碑进度'
  }

  function handleAlert(project, alert, fields) {
    requireScope(project, null, 'owner')
    if (alert.state === 'closed' || !fields.measure.trim() || !fields.assignee.trim() || !fields.due) {
      throw new Error('请填写处理措施、责任人和截止日期。')
    }
    alert.state = 'working'
    alert.treatment = {
      measure: fields.measure.trim(), assignee: fields.assignee.trim(), due: fields.due, at: now(),
      by: roles.owner.name, inputForecast: alert.forecast,
    }
    record('登记预警处理措施', {
      projectId: project.id, projectName: project.name,
      href: projectHref(project.id, 'progress') + (alert.id ? '?alert=' + alert.id : ''),
      detail: '延期 ' + alert.delay + ' 天 · 责任人 ' + alert.treatment.assignee,
    })
  }

  function closeAlert(project, alert, outcome) {
    requireScope(project, null, 'owner')
    if (alert.state === 'closed' || (alert.state === 'open' && alert.delay > delayThreshold) || !outcome.trim()) {
      throw new Error('请先确认处理措施，并填写处理结果。')
    }
    alert.state = 'closed'
    alert.outcome = outcome.trim()
    alert.closedAt = now()
    alert.closedBy = roles.owner.name
    record('关闭预警', {
      projectId: project.id, projectName: project.name,
      href: projectHref(project.id, 'progress') + (alert.id ? '?alert=' + alert.id : ''),
      detail: alert.outcome,
    })
  }

  function closeProject(project, fields) {
    requireScope(project, 'active', 'owner')
    const goal = goalFor(project.goalId)
    const amount = Number(fields.amount)
    if (fields.amount === '' || !Number.isFinite(amount) || amount < 0) throw new Error('请输入大于或等于 0 的确认收入。')
    if (Number(fields.year) !== goal.year || !fields.date || Number(fields.date.slice(0, 4)) !== goal.year) {
      throw new Error('收入所属年度与确认日期须符合年度目标。')
    }
    if (!fields.source.trim()) throw new Error('请填写财务确认来源。')
    project.closing = {
      amount: Math.round(amount * 100) / 100, year: goal.year, date: fields.date,
      source: fields.source.trim(), note: fields.note.trim(), by: roles.owner.name, at: now(),
    }
    project.status = 'closed'
    record('登记结项收入', {
      projectId: project.id, projectName: project.name,
      href: projectHref(project.id, 'close'),
      detail: project.closing.amount + ' 万元 · ' + project.closing.source,
    })
  }

  return {
    data, active, readable, saveForm, decide, retryReview,
    updateSchedule, analyze, handleAlert, closeAlert, closeProject,
    snapshot, applyRemote,
    askRisk: (projectId, alertId, question, history) => analyzeRisk(active.value.projects, data.role, projectId, alertId, question, history),
    askMetrics: (question, history) => queryMetrics(active.value.projects, data.role, question, history),
    askReview: (id, number, question, history) => askReview(active.value.projects, data.role, id, number, question, history),
  }
}

/** 浏览器存储版本：离线可用，供自动化测试与本地调试使用。 */
export function useDemo(initialState = loadLocalState()) {
  const storageUnavailable = ref(false)
  const store = createDemoStore(initialState, {
    onChange(value) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value))
      } catch {
        storageUnavailable.value = true
      }
    },
  })
  return { ...store, storageUnavailable }
}
