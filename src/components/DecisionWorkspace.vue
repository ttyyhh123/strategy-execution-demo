<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { IconActivity, IconArrowDown, IconArrowLeft, IconArrowUpRight, IconBook2, IconMessageCircle, IconPlus } from '@tabler/icons-vue'
import { policySource, policyVersion, riskLevel } from '../agentPolicy.js'
import { alertStates, dateTime, makeId, now } from '../domain.js'
import ConversationComposer from './ConversationComposer.vue'
import Modal from './Modal.vue'
import RiskScopeList from './RiskScopeList.vue'

const props = defineProps({
  api: Object, role: String, projects: Array, projectHint: String, alertHint: String, scope: String, chats: Map,
})
const emit = defineEmits(['navigate'])
const eligible = computed(() => props.projects.filter(item => ['active', 'closed'].includes(item.status)))
const alerts = computed(() => eligible.value.flatMap(project => project.alerts.map(alert => ({ project, alert })))
  .sort((a, b) => Number(a.alert.state === 'closed') - Number(b.alert.state === 'closed') || b.alert.delay - a.alert.delay))
const selected = computed(() => alerts.value.find(entry => entry.project.id === props.projectHint && entry.alert.id === props.alertHint))
const project = computed(() => selected.value?.project)
const alert = computed(() => selected.value?.alert)
const milestone = computed(() => project.value?.milestones.find(item => item.id === alert.value?.milestoneId))
const listProject = computed(() => eligible.value.find(item => item.id === props.projectHint)?.id || '')
const listPath = id => '/risks' + (id ? '/' + id : '')
const lastListPath = ref('/risks')
const progressPath = computed(() => '#/project/' + project.value.id + '/progress?alert=' + encodeURIComponent(alert.value.id))
const threadKey = computed(() => selected.value && JSON.stringify([props.scope, project.value.id, alert.value.id]))
const group = computed(() => props.chats.get(threadKey.value))
const sessions = computed(() => group.value?.sessions || [])
const currentSession = computed(() => sessions.value.find(item => item.id === group.value?.activeId))
const sourceRevision = computed(() => {
  if (!selected.value) return ''
  const { planned, forecast, delay, state, treatment, outcome } = alert.value
  const currentMilestone = milestone.value
  const dependents = currentMilestone ? project.value.milestones.filter(item => item.dependsOn === currentMilestone.id).map(item => item.name) : []
  return JSON.stringify({
    planned, forecast, delay, state, outcome, treatment,
    milestone: [currentMilestone?.name, currentMilestone?.note, currentMilestone?.actual], dependents,
  })
})
const starterPrompts = ['为什么会延期？', '会影响哪些后续节点？', '下一步怎么处理？']
const input = ref('')
const statusFilter = ref('')
const thread = ref(null)
const showLatest = ref(false)
const analysisOpen = ref(false)
const openedRule = ref(null)

watch([selected, listProject], ([record, id]) => {
  if (!record) lastListPath.value = listPath(id)
}, { immediate: true })

watch(threadKey, () => {
  analysisOpen.value = false
  input.value = ''
})

function ask(question, history = []) {
  return props.api.askRisk(project.value.id, alert.value.id, question, history)
}

function showRule(id = 'YJ-01') {
  openedRule.value = policySource(id)
}

function openAnalysis() {
  if (!currentSession.value) newAnalysis()
  analysisOpen.value = true
  restoreScroll()
}

function newAnalysis() {
  const session = {
    id: makeId('analysis'), createdAt: now(), sourceRevision: sourceRevision.value,
    messages: [{ role: 'assistant', ...ask('概览') }],
  }
  if (group.value) group.value.sessions.push(session)
  else props.chats.set(threadKey.value, { activeId: session.id, sessions: [session] })
  selectAnalysis(session.id)
}

function selectAnalysis(id) {
  group.value.activeId = id
  input.value = ''
  restoreScroll()
}

function updateScroll() {
  const element = thread.value
  showLatest.value = Boolean(element && element.scrollHeight - element.scrollTop - element.clientHeight > 80)
}

async function restoreScroll() {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
  updateScroll()
}

function send(value = input.value) {
  const question = value.trim()
  if (!question || !selected.value || !currentSession.value) return
  const messages = currentSession.value.messages
  const answer = ask(question, messages)
  messages.push({ role: 'user', text: question }, { role: 'assistant', ...answer })
  input.value = ''
  restoreScroll()
}
</script>

<template>
  <section class="page-wrap app-page risk-page" aria-labelledby="risk-heading">
    <h1 id="risk-heading" class="sr-only">进度与风险</h1>

    <RiskScopeList v-if="!selected" v-model:status="statusFilter" :projects="eligible" :project-id="listProject" :alerts="alerts"
      @select-project="id => emit('navigate', listPath(id))" @show-rule="showRule()" />

    <template v-else>
      <a :href="'#' + lastListPath" class="text-button risk-back"><IconArrowLeft :size="17" aria-hidden="true" />返回预警列表</a>
      <section class="surface risk-detail" aria-labelledby="risk-detail-heading">
        <header class="risk-detail-head">
          <div>
            <p class="muted">{{ project.name }}</p>
            <h2 id="risk-detail-heading" tabindex="-1">{{ milestone?.name || '里程碑预警' }}</h2>
          </div>
          <button class="button secondary" type="button" aria-haspopup="dialog" @click="showRule()"><IconBook2 :size="17" aria-hidden="true" />预警规则</button>
        </header>

        <div class="risk-status-line">
          <span class="status" :data-status="alert.state">{{ alertStates[alert.state] }}</span>
          <span class="muted">{{ riskLevel(alert.delay) }}</span>
          <span v-if="alert.createdAt" class="muted">触发于 {{ dateTime(alert.createdAt) }}</span>
        </div>
        <dl class="risk-facts">
          <div><dt>预计延期</dt><dd class="warning-text">{{ alert.delay }} 天</dd></div>
          <div><dt>原计划</dt><dd>{{ alert.planned }}</dd></div>
          <div><dt>预计完成</dt><dd>{{ alert.forecast }}</dd></div>
        </dl>
        <section class="risk-follow-up" aria-labelledby="risk-follow-up-heading">
          <h3 id="risk-follow-up-heading">跟进记录</h3>
          <dl class="description-list">
            <template v-if="alert.state !== 'closed'"><dt>进度说明</dt><dd>{{ milestone?.note || '尚未填写' }}</dd></template>
            <template v-if="milestone?.actual"><dt>实际完成</dt><dd>{{ milestone.actual }}</dd></template>
            <template v-if="alert.treatment">
              <dt>处理措施</dt><dd>{{ alert.treatment.measure }}</dd>
              <dt>责任人</dt><dd>{{ alert.treatment.assignee }}</dd>
              <dt>截止日期</dt><dd>{{ alert.treatment.due }}</dd>
            </template>
            <template v-else-if="alert.state !== 'closed'"><dt>处理措施</dt><dd>尚未登记</dd></template>
            <template v-if="alert.state === 'closed'">
              <dt>处理结果</dt><dd>{{ alert.outcome || '尚未记录' }}</dd>
              <template v-if="alert.closedAt"><dt>关闭时间</dt><dd>{{ dateTime(alert.closedAt) }}{{ alert.closedBy ? ' · ' + alert.closedBy : '' }}</dd></template>
            </template>
          </dl>
        </section>
        <footer class="risk-detail-actions">
          <a class="button secondary" :href="progressPath">{{ role === 'owner' && alert.state !== 'closed' ? '查看并处理预警' : '查看进度记录' }}<IconArrowUpRight :size="16" aria-hidden="true" /></a>
          <button type="button" class="button primary" aria-haspopup="dialog" @click="openAnalysis"><IconMessageCircle :size="18" aria-hidden="true" />{{ currentSession ? '继续 AI 分析' : '发起 AI 分析' }}</button>
        </footer>
      </section>
    </template>
  </section>

  <Modal v-if="analysisOpen && currentSession && selected" class="chat-side-dialog" title="AI 风险分析" side @close="analysisOpen = false">
    <div class="risk-dialog-content">
      <div class="risk-dialog-context">
        <p>{{ project.name }}<template v-if="milestone"> · {{ milestone.name }}</template></p>
        <div class="risk-session-tools">
          <label><span class="sr-only">查看分析历史</span><select :value="currentSession.id" @change="selectAnalysis($event.target.value)">
            <option v-for="(session, index) in sessions" :key="session.id" :value="session.id">分析 {{ index + 1 }} · {{ dateTime(session.createdAt) }}</option>
          </select></label>
          <button type="button" class="button secondary" @click="newAnalysis"><IconPlus :size="17" aria-hidden="true" />新建分析</button>
        </div>
        <p v-if="currentSession.sourceRevision !== sourceRevision" class="risk-context-update" role="status">预警数据已更新。新问题使用最新记录，历史回答保留。</p>
      </div>
      <div ref="thread" class="chat-scroll" @scroll.passive="updateScroll">
        <div :key="currentSession.id" class="chat-transcript chat-width" role="log" aria-label="延期分析对话" aria-live="polite">
          <article v-for="(message, index) in currentSession.messages" :key="index" class="chat-turn" :data-role="message.role">
            <div v-if="message.role === 'assistant'" class="chat-assistant-mark"><IconActivity :size="18" aria-hidden="true" /></div>
            <div class="chat-turn-body">
              <span class="sr-only">{{ message.role === 'user' ? '你：' : '风险助手：' }}</span>
              <p>{{ message.text }}</p>
              <div v-if="message.sources?.length" class="chat-sources">
                <template v-for="item in message.sources" :key="item.rule || item.href">
                  <a v-if="item.href" :href="item.href"><IconArrowUpRight :size="15" aria-hidden="true" />{{ item.label }}</a>
                  <button v-else type="button" @click="showRule(item.rule)"><IconBook2 :size="14" aria-hidden="true" />{{ item.label }}</button>
                </template>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div class="chat-compose-area chat-width">
        <button v-if="showLatest" type="button" class="chat-jump chat-icon" aria-label="查看最新消息" @click="thread.scrollTop = thread.scrollHeight"><IconArrowDown :size="19" aria-hidden="true" /></button>
        <div class="chat-starters risk-chat-starters" aria-label="常用问题">
          <button v-for="prompt in starterPrompts" :key="prompt" type="button" @click="send(prompt)">{{ prompt }}</button>
        </div>
        <ConversationComposer v-model="input" label="向风险助手发送消息" placeholder="询问延期原因、影响或下一步" :max-length="1000" @send="send()" />
      </div>
    </div>
  </Modal>
  <Modal v-if="openedRule" title="延期预警规则" side @close="openedRule = null">
    <div class="agent-reader"><article><span class="agent-meta">{{ openedRule.id }} · {{ policyVersion }}</span><h3>{{ openedRule.title }}</h3><p>{{ openedRule.text }}</p></article></div>
  </Modal>
</template>
