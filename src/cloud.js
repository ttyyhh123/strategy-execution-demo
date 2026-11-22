import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

// 云服务开通时下发的公开配置：可随前端代码发布，不含任何长期密钥。
// endpoint 必须显式传入（同源回退不可依赖），换域名后需同步更新并重新发布。
export const publicConfig = {
  endpoint: 'https://strategy-execution-helper.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_el55bHcKeHSfeXXAArmppo_HsQ8eR1kmoWVhjUuNJCgNMHwY0jyFhwv',
}

export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})

const workspaceId = 'main'
const workspaceColumns = 'id, payload, revision, updated_at, updated_by'
const activityColumns = 'id, action, actor, project_name, version, href, detail, created_at'

export class CloudServiceError extends Error {
  constructor(message, { code = '', retryable = true } = {}) {
    super(message)
    this.name = 'CloudServiceError'
    this.code = code
    this.retryable = retryable
  }
}

/** 云端版本号已变化：调用方需要重新载入，不能覆盖别人的提交。 */
export class CloudConflictError extends CloudServiceError {
  constructor() {
    super('云端工作区已被其他窗口更新。', { code: 'conflict', retryable: false })
    this.name = 'CloudConflictError'
  }
}

function toServiceError(error) {
  const code = error?.code || ''
  if (code === '42P01') return new CloudServiceError('云端数据表尚未就绪，请稍后重试或联系管理员。', { code, retryable: false })
  if (code === '42501') return new CloudServiceError('云端拒绝了本次数据访问，请检查数据权限配置。', { code, retryable: false })
  if (code === '23505') return new CloudServiceError('云端已存在同一条工作区记录，请刷新后重试。', { code, retryable: false })
  if (code === '23514') return new CloudServiceError('提交的数据不符合云端约束，请刷新后重试。', { code, retryable: false })
  const status = error?.status ?? error?.statusCode
  if (status === 401) return new CloudServiceError('云服务凭据已失效，请重新开通云服务后再试。', { code: '401', retryable: false })
  if (status === 429) return new CloudServiceError('云端请求过于频繁，请稍后再试。', { code: '429' })
  const text = String(error?.message || '')
  if (/failed to fetch|network|networkerror|load failed|timeout|aborted/i.test(text)) {
    return new CloudServiceError('网络不可用，无法连接云服务。请检查网络后重试。', { code: 'network' })
  }
  return new CloudServiceError(text || '云服务返回未知错误，请重试。', { code: code || 'unknown' })
}

/** 读取共享工作区快照；尚未初始化时返回 null。 */
export async function loadWorkspace() {
  const { data, error } = await cloud.database
    .from('strategy_workspace')
    .select(workspaceColumns)
    .eq('id', workspaceId)
    .maybeSingle()
  if (error) throw toServiceError(error)
  return data
}

/** 首次访问时用初始演示数据建库；并发创建撞上唯一键时返回 null，交给调用方重读。 */
export async function createWorkspace(payload) {
  const { data, error } = await cloud.database
    .from('strategy_workspace')
    .insert({ id: workspaceId, payload, revision: 1 })
    .select(workspaceColumns)
    .single()
  if (error) {
    if (error.code === '23505') return null
    throw toServiceError(error)
  }
  return data
}

/**
 * 带版本号条件写入：只有云端版本仍是 revision 时才更新成功。
 * 返回新的版本号；返回空行说明版本已被他人推进，抛 CloudConflictError。
 */
export async function saveWorkspace({ payload, revision, updatedBy }) {
  const { data, error } = await cloud.database
    .from('strategy_workspace')
    .update({
      payload,
      revision: revision + 1,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy || null,
    })
    .eq('id', workspaceId)
    .eq('revision', revision)
    .select('revision')
  if (error) throw toServiceError(error)
  const rows = Array.isArray(data) ? data : []
  if (!rows.length) throw new CloudConflictError()
  return Number(rows[0].revision)
}

/** 工作区最近流转（仅追加）。 */
export async function fetchActivity(limit = 6) {
  const { data, error } = await cloud.database
    .from('strategy_activity')
    .select(activityColumns)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw toServiceError(error)
  return data || []
}

export async function logActivity(entry) {
  const { error } = await cloud.database
    .from('strategy_activity')
    .insert({ workspace_id: workspaceId, ...entry })
  if (error) throw toServiceError(error)
}
