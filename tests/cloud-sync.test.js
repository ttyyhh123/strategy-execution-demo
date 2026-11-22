import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick } from 'vue'
import { createDemoStore, seedState } from '../src/useDemo.js'

function mockTimers(context) {
  const tasks = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    value: { setTimeout: callback => tasks.push(callback) }, configurable: true,
  })
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  return tasks
}

test('业务动作产生可写入云端的流转留痕，状态变化通知云端保存', async context => {
  mockTimers(context)
  const changes = []
  const actions = []
  const store = createDemoStore(seedState(), {
    onChange: value => changes.push(value),
    onAction: entry => actions.push(entry),
  })

  const project = store.active.value.projects[0]
  assert.equal(project.status, 'pending')
  store.decide(project, 2, 'approve')

  assert.equal(project.status, 'active')
  assert.equal(actions.length, 1)
  assert.deepEqual(
    { action: actions[0].action, project: actions[0].projectName, version: actions[0].version, actor: actions[0].actor },
    { action: '批准立项', project: '远程诊断模块', version: 2, actor: '许晨' },
  )
  assert.equal(actions[0].href, '#/project/remote-diagnostics/review?v=2')

  await nextTick()
  assert.ok(changes.length >= 1, '状态变化应触发一次云端写入')
  assert.equal(typeof changes[0], 'object')
})

test('载入云端数据时不回写，避免覆盖其他窗口的更新', async context => {
  mockTimers(context)
  const changes = []
  const store = createDemoStore(seedState(), { onChange: value => changes.push(value) })

  const before = changes.length
  store.applyRemote({ ...store.snapshot(), role: 'manager' })
  await nextTick()
  await nextTick()

  assert.equal(store.data.role, 'manager')
  assert.equal(changes.length, before)

  // 载入完成后，后续改动恢复上报
  store.data.role = 'owner'
  await nextTick()
  assert.equal(changes.length, before + 1)
})

test('快照是纯 JSON，可直接作为云端 payload', () => {
  const store = createDemoStore(seedState())
  const snapshot = store.snapshot()
  assert.ok(Array.isArray(snapshot.flow.projects))
  assert.ok(Array.isArray(snapshot.review.projects))
  const reopened = JSON.parse(JSON.stringify(snapshot))
  assert.equal(reopened.review.projects[0].name, '远程诊断模块')
  assert.equal(reopened.scenario, 'review')
})
