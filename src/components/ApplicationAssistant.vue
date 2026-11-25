<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  IconArrowDown, IconArrowRight, IconArrowUpRight, IconBook2, IconCircleCheck, IconClipboardCheck, IconEdit, IconListCheck,
  IconFileDescription, IconFilePlus, IconLayoutSidebar, IconMessageCircle, IconPaperclip, IconPlus, IconSquaresFilled,
  IconTrash,
} from '@tabler/icons-vue'
import { approvalRoute, blockingIssues, checkApplication, knowledge, policySource, policyVersion, projectTypes, roi } from '../agentPolicy.js'
import {
  applicationTitle, continueApplication, createApplicationChat, pushMessage, respondToApplication, reviewApplication,
} from '../applicationConversation.js'
import { applicationFields, chooseType, fillProductExample } from '../applicationDraft.js'
import { clone, goalFor, makeId, money, projectStates } from '../domain.js'
import Modal from './Modal.vue'
import ConversationComposer from './ConversationComposer.vue'

const props = defineProps({ project: Object, projects: Array, api: Object, workspace: Object, startOnEntry: Boolean })
const emit = defineEmits(['notify', 'submitted'])
const initial = props.project ? props.workspace.chats.find(item => item.recordId === props.project.id)
  : !props.startOnEntry && props.workspace.chats.find(item => item.id === props.workspace.activeId)

if (initial) props.workspace.activeId = initial.id
else addChat(props.project, props.startOnEntry)

const chat = computed(() => props.workspace.chats.find(item => item.id === props.workspace.activeId))
const draft = computed(() => chat.value.draft)
const drafts = computed(() => props.projects.filter(item => ['draft', 'returned'].includes(item.status)))
const history = computed(() => props.workspace.chats.filter(item => item.messages.length).reverse())
const latestReview = computed(() => chat.value.messages.findLast(item => item.kind === 'review'))
const canSubmit = computed(() => !chat.value.submitted && latestReview.value && !blockingIssues(checkApplication(draft.value)).length)
const lane = approvalRoute()
const input = ref('')
const composer = ref(null)
const thread = ref(null)
const showLatest = ref(false)
const sidebarOpen = ref(false)
const newChatButton = ref(null)
const dialog = ref('')
const chatToDelete = ref(null)
const sourceId = ref('')
const source = computed(() => policySource(sourceId.value))
const fileError = ref('')
const actionError = ref('')
const manual = ref(null)
const manualFields = computed(() => manual.value ? applicationFields(manual.value) : [])
const welcome = computed(() => !chat.value.messages.length)
const canLoadExample = computed(() => !chat.value.submitted && !draft.value.category && !draft.value.name && !draft.value.materials.length)
const starters = [
  { icon: IconClipboardCheck, title: '申报资格诊断', description: '了解两类项目的立项条件', text: '产品开发类和技术研究类分别有哪些立项准入条件？' },
  { icon: IconBook2, title: '政策智能匹配', description: '按年度目标和投资指引查找申报依据', text: '今年的年度目标和投资指引是什么？' },
  { icon: IconFilePlus, title: '申报材料生成', description: '通过对话准备立项申报草稿', text: '我想发起一个立项' },
  { icon: IconListCheck, title: '材料完整性检查', description: '对照申报模板查看必填项和附件', text: '立项申报需要哪些必填字段和支持材料？' },
]
onMounted(scrollLatest)

function addChat(project, start) {
  const next = createApplicationChat(project, start)
  props.workspace.chats.push(next)
  props.workspace.activeId = next.id
}

function selectChat(id) {
  props.workspace.activeId = id
  input.value = ''
  fileError.value = ''
  sidebarOpen.value = false
  scrollLatest()
}

function newChat() {
  const empty = props.workspace.chats.find(item => !item.started && !item.messages.length)
  if (!empty) addChat()
  selectChat(empty?.id || props.workspace.activeId)
  nextTick(() => composer.value?.focus({ preventScroll: true }))
}

function requestDeleteChat(item) {
  chatToDelete.value = item
  openDialog('delete-chat')
}

function closeDeleteChat() {
  chatToDelete.value = null
  dialog.value = ''
}

function deleteChat() {
  const id = chatToDelete.value.id
  const wasActive = props.workspace.activeId === id
  props.workspace.chats = props.workspace.chats.filter(item => item.id !== id)
  closeDeleteChat()

  if (wasActive) {
    const replacement = props.workspace.chats.at(-1)
    if (!replacement) addChat()
    selectChat(replacement?.id || props.workspace.activeId)
  }
  nextTick(() => {
    if (wasActive) composer.value?.focus({ preventScroll: true })
    else newChatButton.value?.focus({ preventScroll: true })
  })
}

function openSaved(project) {
  const saved = props.workspace.chats.find(item => item.recordId === project.id)
  if (!saved) addChat(project)
  selectChat(saved?.id || props.workspace.activeId)
}

function updateScroll() {
  const element = thread.value
  showLatest.value = Boolean(element && element.scrollHeight - element.scrollTop - element.clientHeight > 80)
}

async function scrollLatest() {
  await nextTick()
  const element = thread.value
  if (element) element.scrollTop = element.scrollHeight
  updateScroll()
}

function send(value = input.value) {
  const text = value.trim()
  if (!text) return
  input.value = ''
  respondToApplication(chat.value, text)
  scrollLatest()
}

function sendStarter(text) {
  send(text)
  nextTick(() => composer.value?.focus({ preventScroll: true }))
}

function openDialog(next) {
  actionError.value = ''
  dialog.value = next
}

function openSource(id = '') {
  sourceId.value = id
  openDialog('knowledge')
}

function example() {
  if (!canLoadExample.value) return
  sidebarOpen.value = false
  fillProductExample(draft.value)
  chat.value.started = true
  reviewApplication(chat.value, '已载入远程诊断模块样例。客户沟通纪要只有试用意向。')
  scrollLatest()
}

function preflight() {
  dialog.value = ''
  reviewApplication(chat.value)
  scrollLatest()
}

function openManual() {
  manual.value = clone(draft.value)
  sidebarOpen.value = false
  openDialog('manual')
}

function applyManual() {
  chat.value.draft = manual.value
  chat.value.started = true
  dialog.value = ''
  continueApplication(chat.value, '已将补录内容更新到当前草稿。')
  scrollLatest()
}

function newMilestone() {
  manual.value.milestones.push({ id: makeId('milestone'), name: '', planned: '', dependsOn: '' })
}

function removeMilestone(id) {
  manual.value.milestones = manual.value.milestones.filter(item => item.id !== id)
  for (const item of manual.value.milestones) if (item.dependsOn === id) item.dependsOn = ''
}

function newMaterial() {
  manual.value.materials.push({ id: makeId('file'), title: '', body: '' })
}

async function addFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  fileError.value = ''
  if (!file || chat.value.submitted) return
  if (!/\.(txt|md|csv)$/iu.test(file.name) || file.size > 200_000) {
    fileError.value = '请选择 200 KB 以内的 TXT、Markdown 或 CSV 文件。也可以把材料原文粘贴到对话里。'
    return
  }
  const current = chat.value
  try {
    const body = (await file.text()).trim()
    if (!body) throw new Error('材料为空。')
    if (current.submitted) return
    current.draft.materials.push({ id: makeId('file'), title: file.name, body })
    current.started = true
    continueApplication(current, '已将《' + file.name + '》添加到申报材料。')
    if (chat.value.id === current.id) scrollLatest()
  } catch (error) { fileError.value = error.message || '材料读取失败。' }
}

function save(submit = false) {
  actionError.value = ''
  if (chat.value.submitted || (submit && !canSubmit.value)) return
  try {
    const id = props.api.saveForm(draft.value, chat.value.recordId, submit)
    chat.value.recordId = id
    dialog.value = ''
    if (submit) {
      chat.value.submitted = true
      pushMessage(chat.value, 'assistant', '「' + draft.value.name + '」已送审，等待' + lane.label + ' ' + lane.name + '处理。', { kind: 'submitted' })
      emit('submitted')
      scrollLatest()
    } else {
      emit('notify', '草稿已保存，可以在侧栏或项目台账中继续。')
    }
  } catch (error) {
    actionError.value = error.message
  }
}
</script>

<template>
  <section class="page-wrap app-page chat-page" aria-labelledby="application-heading">
    <h1 id="application-heading" class="sr-only">申报助手</h1>
    <div class="conversation-frame application-frame" @keydown.esc="sidebarOpen = false">
    <button v-if="sidebarOpen" class="conversation-scrim" aria-label="关闭对话侧栏" type="button" @click="sidebarOpen = false"></button>
    <aside id="owner-chat-sidebar" class="chat-sidebar" :data-open="sidebarOpen" aria-label="对话和草稿">
      <button ref="newChatButton" class="chat-new" type="button" @click="newChat"><IconPlus :size="19" aria-hidden="true" />新对话</button>
      <div class="chat-sidebar-scroll">
        <section v-if="history.length" aria-labelledby="chat-history-label">
          <h2 id="chat-history-label">最近对话</h2>
          <ul class="chat-history-list">
            <li v-for="item in history" :key="item.id" class="chat-history-row">
              <button class="chat-sidebar-item" :aria-current="item.id === chat.id ? 'true' : undefined" type="button" @click="selectChat(item.id)">
                <IconMessageCircle :size="17" aria-hidden="true" /><span :title="applicationTitle(item)">{{ applicationTitle(item) }}</span>
              </button>
              <button class="chat-icon chat-history-delete" type="button" :aria-label="'删除对话：' + applicationTitle(item)" title="删除对话" @click="requestDeleteChat(item)">
                <IconTrash :size="17" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>
        <section v-if="drafts.length" aria-labelledby="chat-drafts-label">
          <h2 id="chat-drafts-label">申报草稿</h2>
          <button v-for="item in drafts" :key="item.id" class="chat-sidebar-item" type="button" @click="openSaved(item)">
            <IconFileDescription :size="17" aria-hidden="true" /><span :title="item.name">{{ item.name }}</span><small v-if="item.status === 'returned'">{{ projectStates[item.status] }}</small>
          </button>
        </section>
      </div>
      <footer class="chat-sidebar-footer">
        <button v-if="canLoadExample" class="chat-sidebar-item" type="button" @click="example"><IconFilePlus :size="17" aria-hidden="true" />载入样例</button>
        <button v-if="!chat.submitted" class="chat-sidebar-item" type="button" @click="openManual"><IconEdit :size="17" aria-hidden="true" />手动补录</button>
      </footer>
    </aside>

    <div class="chat-main">
      <header class="chat-top">
        <div>
          <button class="chat-icon chat-sidebar-toggle" type="button" aria-label="对话侧栏" aria-controls="owner-chat-sidebar" :aria-expanded="sidebarOpen" @click="sidebarOpen = !sidebarOpen"><IconLayoutSidebar :size="20" aria-hidden="true" /></button>
          <span class="chat-top-name">{{ welcome ? '新对话' : applicationTitle(chat) }}</span>
        </div>
        <div>
          <button v-if="chat.started && !chat.submitted" class="chat-top-draft" type="button" @click="openDialog('draft')"><IconFileDescription :size="17" aria-hidden="true" />查看草稿</button>
          <button class="chat-icon" type="button" aria-label="查看立项规则" title="查看立项规则" @click="openSource()"><IconBook2 :size="19" aria-hidden="true" /></button>
        </div>
      </header>

      <div v-if="welcome" class="application-welcome chat-scroll">
        <div class="chat-width application-welcome-content">
          <div class="application-intro">
            <h2>让企业申报更简单</h2>
            <p>描述你的企业和项目需求，AI 将协助你进行申报资格诊断、政策匹配和申报材料准备。</p>
          </div>
          <div class="application-tasks" role="group" aria-label="常用申报任务">
            <button v-for="starter in starters" :key="starter.title" class="application-task" type="button" @click="sendStarter(starter.text)">
              <span class="application-task-icon"><component :is="starter.icon" :size="20" aria-hidden="true" /></span>
              <span><strong>{{ starter.title }}</strong><small>{{ starter.description }}</small></span>
              <IconArrowUpRight :size="16" class="application-task-arrow" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div v-else ref="thread" class="chat-scroll" @scroll.passive="updateScroll">
        <div class="chat-transcript chat-width" role="log" aria-label="申报对话" aria-live="polite">
          <article v-for="(message, index) in chat.messages" :key="chat.id + ':' + index" class="chat-turn" :data-role="message.role">
            <div v-if="message.role === 'assistant'" class="chat-assistant-mark"><IconSquaresFilled :size="16" aria-hidden="true" /></div>
            <div class="chat-turn-body">
              <span class="sr-only">{{ message.role === 'user' ? '你：' : '申报助手：' }}</span>
              <p>{{ message.text }}</p>
              <div v-if="message.sources?.length" class="chat-sources">
                <button v-for="item in message.sources" :key="item.rule" type="button" @click="openSource(item.rule)"><IconBook2 :size="14" aria-hidden="true" />{{ item.label }}</button>
              </div>
              <div v-if="message.kind === 'select-type' && !draft.application.type && index === chat.messages.length - 1" class="chat-turn-actions">
                <button v-for="label in projectTypes" :key="label" type="button" class="button secondary small" @click="send(label)">{{ label }}<IconArrowRight :size="16" aria-hidden="true" /></button>
              </div>
              <div v-if="message.kind === 'review'" class="chat-review" :data-result="message.checks.length ? 'blocked' : 'ready'">
                <ul v-if="message.checks.length">
                  <li v-for="(issue, issueIndex) in message.checks" :key="issueIndex">
                    <span class="agent-level" :data-level="issue.level">{{ issue.level }}</span><span>{{ issue.message }}</span>
                    <button class="text-button" type="button" :aria-label="'查看条款 ' + issue.source" @click="openSource(issue.source)">{{ issue.source }}</button>
                  </li>
                </ul>
                <div v-else class="chat-review-summary"><IconCircleCheck :size="19" aria-hidden="true" /><span>{{ draft.name }} · {{ lane.label }} {{ lane.name }}</span></div>
                <div v-if="message === latestReview && !chat.submitted" class="chat-turn-actions">
                  <button type="button" class="button secondary small" @click="openDialog('draft')">查看草稿</button>
                  <button v-if="canSubmit" type="button" class="button primary small" @click="openDialog('submit')">确认送审<IconArrowRight :size="16" aria-hidden="true" /></button>
                </div>
              </div>
              <a v-if="message.kind === 'submitted'" class="text-button" :href="'#/project/' + chat.recordId + '/review'">查看送审记录<IconArrowUpRight :size="16" aria-hidden="true" /></a>
            </div>
          </article>
        </div>
      </div>

      <div class="chat-compose-area chat-width">
        <button v-if="showLatest && !welcome" type="button" class="chat-jump chat-icon" aria-label="查看最新消息" @click="scrollLatest"><IconArrowDown :size="19" aria-hidden="true" /></button>
        <ConversationComposer ref="composer" v-model="input" label="向申报助手发送消息" placeholder="询问立项规则，或描述你想申报的项目…" @send="send()">
          <label v-if="!chat.submitted" class="chat-icon chat-attach" title="添加文本材料"><IconPaperclip :size="20" aria-hidden="true" /><input type="file" aria-label="添加文本材料" accept=".txt,.md,.csv" @change="addFile" /></label>
        </ConversationComposer>
        <p v-if="fileError" class="chat-file-error field-error" role="alert">{{ fileError }}</p>
        <p class="chat-compose-note">演示环境 · 请核对条款和材料后送审</p>
      </div>
    </div>
    </div>
  </section>

  <Modal v-if="dialog === 'knowledge'" title="立项规则" side @close="dialog = ''">
    <div class="agent-reader">
      <p class="agent-meta">{{ policyVersion }} · 暂行配置，仅供演示</p>
      <button v-if="source" type="button" class="text-button" @click="sourceId = ''">查看全部条款</button>
      <article v-for="item in source ? [source] : knowledge" :key="item.id"><span class="agent-meta">{{ item.id }} · {{ item.type }}</span><h3>{{ item.title }}</h3><p>{{ item.text }}</p></article>
    </div>
  </Modal>

  <Modal v-else-if="dialog === 'delete-chat' && chatToDelete" title="删除对话" @close="closeDeleteChat">
    <div class="dialog-form">
      <p>删除「{{ applicationTitle(chatToDelete) }}」后，聊天记录和本次未保存的填写内容将无法恢复。已保存的申报草稿和已提交的项目会保留。</p>
      <div class="modal-actions">
        <button type="button" class="button secondary" autofocus @click="closeDeleteChat">取消</button>
        <button type="button" class="button destructive" @click="deleteChat">确认删除</button>
      </div>
    </div>
  </Modal>

  <Modal v-else-if="dialog === 'draft'" title="申报草稿" side @close="dialog = ''">
    <div class="chat-draft">
      <h3>{{ draft.name || '待填写项目名称' }}</h3>
      <dl class="agent-facts">
        <div><dt>项目类型</dt><dd>{{ draft.category || '待选择' }}</dd></div>
        <div><dt>年度目标</dt><dd>{{ goalFor(draft.goalId)?.name || '待选择' }}</dd></div>
        <div v-for="field in applicationFields(draft).filter(item => item.key !== 'name')" :key="field.key">
          <dt>{{ field.label }}</dt><dd>{{ (field.group ? draft[field.group][field.key] : draft[field.key]) || '待填写' }}</dd>
        </div>
        <div v-if="draft.application.type === 'product'"><dt>演示回报率</dt><dd>{{ roi(draft) }}</dd></div>
        <div><dt>里程碑</dt><dd>{{ draft.milestones.length }} 项</dd></div>
        <div><dt>支持材料</dt><dd>{{ draft.materials.length }} 份</dd></div>
        <div><dt>拟送审</dt><dd>{{ lane.label }} {{ lane.name }}</dd></div>
      </dl>
      <details v-if="draft.milestones.length || draft.materials.length" class="chat-draft-details">
        <summary>里程碑和材料明细</summary>
        <p v-for="item in draft.milestones" :key="item.id">{{ item.name }} · {{ item.planned }}</p>
        <p v-for="item in draft.materials" :key="item.id">{{ item.title }}</p>
      </details>
      <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
      <div class="chat-turn-actions">
        <button type="button" class="text-button" @click="openManual">手动补录</button>
        <button class="button secondary" type="button" :disabled="!draft.name.trim() || !draft.goalId" @click="save()">保存草稿</button>
        <button v-if="canSubmit" class="button primary" type="button" @click="openDialog('submit')">确认送审</button>
        <button v-else class="button primary" type="button" @click="preflight">检查申请</button>
      </div>
    </div>
  </Modal>

  <Modal v-else-if="dialog === 'manual'" title="手动补录" side @close="dialog = ''">
    <form class="agent-editor" @submit.prevent="applyManual">
      <label>项目类型<select :value="manual.application.type" @change="chooseType(manual, $event.target.value)"><option disabled value="">请选择</option><option v-for="(label, type) in projectTypes" :key="type" :value="type">{{ label }}</option></select></label>
      <template v-if="manual.application.type">
        <template v-for="field in manualFields" :key="field.key">
          <label v-if="field.group">{{ field.label }}<input v-model="manual[field.group][field.key]" :type="field.numeric ? 'number' : 'text'" :step="field.numeric ? 'any' : undefined" /></label>
          <label v-else-if="field.key === 'description'">{{ field.label }}<textarea v-model="manual.description" rows="3" /></label>
          <label v-else>{{ field.label }}<input v-model="manual[field.key]" :type="field.date ? 'date' : field.numeric ? 'number' : 'text'" :step="field.numeric ? 'any' : undefined" /></label>
        </template>
        <fieldset><legend>里程碑</legend>
          <div v-for="(item, index) in manual.milestones" :key="item.id" class="agent-edit-row">
            <label>名称<input v-model="item.name" type="text" /></label><label>计划日期<input v-model="item.planned" type="date" /></label>
            <label v-if="index">前置里程碑<select v-model="item.dependsOn"><option value="">无</option><option v-for="previous in manual.milestones.slice(0, index)" :key="previous.id" :value="previous.id">{{ previous.name || '未命名里程碑' }}</option></select></label>
            <button type="button" class="text-button agent-remove" @click="removeMilestone(item.id)">从草稿移除</button>
          </div>
          <button type="button" class="text-button" @click="newMilestone">添加里程碑</button>
        </fieldset>
        <fieldset><legend>支持材料</legend>
          <div v-for="item in manual.materials" :key="item.id" class="agent-edit-file">
            <label>材料名称<input v-model="item.title" /></label><label>材料原文<textarea v-model="item.body" rows="3" /></label>
            <button type="button" class="text-button agent-remove" @click="manual.materials = manual.materials.filter(material => material.id !== item.id)">从草稿移除</button>
          </div>
          <button type="button" class="text-button" @click="newMaterial">添加材料原文</button>
        </fieldset>
      </template>
      <div class="chat-manual-actions"><button type="button" class="button secondary" @click="dialog = ''">取消</button><button type="submit" class="button primary" :disabled="!manual.application.type">应用到草稿</button></div>
    </form>
  </Modal>

  <Modal v-else-if="dialog === 'submit'" title="确认送审" @close="dialog = ''">
    <div class="dialog-form">
      <p>将「{{ draft.name }}」的草稿和材料提交给{{ lane.label }} {{ lane.name }}，并保存本次申报版本。</p>
      <p v-if="draft.application.type === 'product'">承诺收入 {{ money(draft.commitment) }}</p>
      <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
      <div class="modal-actions"><button type="button" class="button secondary" @click="dialog = ''">返回对话</button><button type="button" class="button primary" :disabled="!canSubmit" @click="save(true)">提交审批</button></div>
    </div>
  </Modal>
</template>
