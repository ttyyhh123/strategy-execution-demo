import { computed, ref } from 'vue'
import {
  CloudConflictError, createWorkspace, fetchActivity, loadWorkspace, logActivity, saveWorkspace,
} from './cloud.js'
import { roles } from './domain.js'
import { createDemoStore, seedState } from './useDemo.js'

const saveDelay = 600
const activityLimit = 6

/**
 * 把演示工作区接到云数据库：
 * - 启动时拉取共享工作区快照，没有就写入初始演示数据；
 * - 状态变化后合并写入（带版本号条件，防止两个窗口互相覆盖）；
 * - 申报、审批、进度、结项等动作追加到流转留痕。
 */
export function useCloudDemo() {
  const status = ref('loading')      // loading | ready | error
  const bootMessage = ref('')
  const syncState = ref('idle')      // idle | saving | saved | error | conflict
  const syncMessage = ref('')
  const activity = ref([])

  let revision = 0
  let hydrated = false
  let queued = null
  let timer = 0
  let writing = false

  const api = createDemoStore(seedState(), {
    onChange(value) {
      if (!hydrated) return
      queued = value
      syncState.value = 'saving'
      schedule()
    },
    onAction(entry) {
      if (!hydrated) return
      logActivity(entry)
        .then(refreshActivity)
        .catch(error => console.warn('[cloud] 流转留痕写入失败：' + error.message))
    },
  })

  const syncLabel = computed(() => ({
    idle: '',
    saving: '正在保存到云端',
    saved: '云端已同步',
    error: '云端保存失败',
    conflict: '已载入云端最新数据',
  })[syncState.value] || '')

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(flush, saveDelay)
  }

  async function flush() {
    if (!queued || writing) return
    const payload = queued
    queued = null
    writing = true
    try {
      revision = await saveWorkspace({ payload, revision, updatedBy: roles[api.data.role].name })
      syncState.value = 'saved'
      syncMessage.value = ''
    } catch (error) {
      if (error instanceof CloudConflictError) {
        await adoptRemote('其他窗口已更新数据，已载入云端最新版本。')
      } else {
        queued = queued || payload
        syncState.value = 'error'
        syncMessage.value = error.message
      }
    } finally {
      writing = false
      if (queued && syncState.value === 'saving') schedule()
    }
  }

  async function adoptRemote(message) {
    try {
      const workspace = await loadWorkspace()
      if (!workspace) throw new Error('云端工作区已不存在，请重新连接。')
      revision = Number(workspace.revision) || 1
      api.applyRemote(workspace.payload)
      queued = null
      syncState.value = 'conflict'
      syncMessage.value = message
      refreshActivity()
    } catch (error) {
      syncState.value = 'error'
      syncMessage.value = error.message
    }
  }

  async function refreshActivity() {
    try {
      activity.value = await fetchActivity(activityLimit)
    } catch (error) {
      console.warn('[cloud] 流转留痕读取失败：' + error.message)
    }
  }

  async function start() {
    status.value = 'loading'
    bootMessage.value = ''
    try {
      let workspace = await loadWorkspace()
      if (!workspace) workspace = await createWorkspace(api.snapshot()) || await loadWorkspace()
      if (!workspace) throw new Error('云端工作区初始化失败，请重试。')
      revision = Number(workspace.revision) || 1
      api.applyRemote(workspace.payload)
      hydrated = true
      status.value = 'ready'
      syncState.value = 'saved'
      syncMessage.value = ''
      refreshActivity()
    } catch (error) {
      hydrated = false
      status.value = 'error'
      bootMessage.value = error.message
    }
  }

  function retryBoot() {
    return start()
  }

  async function retrySync() {
    if (!queued) return adoptRemote('已重新载入云端最新版本。')
    syncState.value = 'saving'
    return flush()
  }

  return {
    api, status, bootMessage, syncState, syncMessage, syncLabel, activity,
    start, retryBoot, retrySync,
  }
}
