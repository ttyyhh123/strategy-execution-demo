import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { seedScenario } from '../src/domain.js'
import { useDemo } from '../src/useDemo.js'

function overdueProject(role = 'owner') {
  const state = { role, scenario: 'flow', flow: seedScenario('flow'), review: seedScenario('review') }
  const project = state.flow.projects[0]
  project.status = 'active'
  project.milestones[0].forecast = '2026-12-05'
  project.milestones[1].forecast = '2026-12-25'
  return { state, project }
}

function mockBrowser(context, state) {
  let saved = JSON.stringify(state)
  const tasks = []
  const globals = {
    localStorage: { getItem: () => saved, setItem: (_key, value) => { saved = value } },
    window: { setTimeout: callback => tasks.push(callback) },
  }
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true })
    context.after(() => {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  return { runAi: () => tasks.splice(0).forEach(run => run()) }
}

test('loading an active project repairs missing 15-day and 25-day alerts without changing its dates', async context => {
  const { state, project } = overdueProject('manager')
  const browser = mockBrowser(context, state)
  const api = useDemo()
  const restored = api.active.value.projects[0]
  assert.deepEqual(restored.milestones, project.milestones)
  assert.deepEqual(restored.alerts.map(alert => alert.delay), [15, 25])
  browser.runAi()
  assert.ok(restored.alerts.every(alert => alert.analyses[0].status === 'done'))
  await nextTick()

  const reopened = useDemo().active.value.projects[0]
  assert.deepEqual(reopened.alerts.map(alert => alert.id), restored.alerts.map(alert => alert.id))
})

test('loading skips completed milestones and preserves closed alerts until a new threshold crossing', async context => {
  const { state, project } = overdueProject()
  project.milestones[1].actual = '2026-12-25'
  project.alerts = [{
    id: 'closed-1', milestoneId: 'trial', state: 'closed', delay: 15, analyses: [], outcome: '已处理',
  }]
  mockBrowser(context, state)
  const api = useDemo()
  const restored = api.active.value.projects[0]
  assert.deepEqual(restored.alerts, project.alerts)
  api.updateSchedule(restored, 'trial', { forecast: '2026-12-05', actual: '', note: '' })
  assert.equal(restored.alerts.length, 1)
  api.updateSchedule(restored, 'trial', { forecast: '2026-11-25', actual: '', note: '' })
  assert.equal(restored.alerts.length, 1)
  api.updateSchedule(restored, 'trial', { forecast: '2026-11-27', actual: '', note: '' })
  assert.deepEqual(restored.alerts.map(alert => alert.state), ['closed', 'open'])
  assert.equal(restored.alerts[1].delay, 7)
  await nextTick()
})

test('marking an overdue milestone unfinished produces its first alert at the same forecast date', async context => {
  const { state, project } = overdueProject()
  project.milestones[0].actual = '2026-12-12'
  project.milestones[1].actual = '2026-12-25'
  mockBrowser(context, state)
  const api = useDemo()
  const restored = api.active.value.projects[0]
  assert.equal(restored.alerts.length, 0)
  api.updateSchedule(restored, 'trial', { forecast: '2026-12-05', actual: '', note: '' })
  api.updateSchedule(restored, 'trial', { forecast: '2026-12-05', actual: '', note: '' })
  assert.deepEqual(restored.alerts.map(alert => alert.delay), [15])
  await nextTick()
})
