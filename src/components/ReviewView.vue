<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { IconArrowRight, IconArrowUpRight, IconFileText, IconHistory, IconLoader2, IconMessageCircle } from '@tabler/icons-vue'
import { currentVersion, dateTime, goalFor, money, reviewRule, roles } from '../domain.js'
import { policySource, reviewFindings, typeFields, typeOf } from '../agentPolicy.js'
import ReviewAssistant from './ReviewAssistant.vue'
import ReviewDocumentText from './ReviewDocumentText.vue'
import Modal from './Modal.vue'

const props = defineProps({ project: Object, role: String, versionHint: Number, api: Object, chats: Map, scenario: String, desk: Boolean })
const emit = defineEmits(['notify', 'navigate'])
const latest = computed(() => currentVersion(props.project))
const versionNumber = computed(() => props.project.versions.some(item => item.number === props.versionHint) ? props.versionHint : latest.value.number)
const version = computed(() => props.project.versions.find(item => item.number === versionNumber.value))
const form = computed(() => version.value.form)
const goal = computed(() => goalFor(form.value.goalId))
const type = computed(() => typeOf(form.value))
const submittedAt = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const numberLabel = value => value != null && String(value).trim() && Number.isFinite(Number(value)) ? money(Number(value)) : '未填写'
const specialistFields = computed(() => [
  ...(type.value === 'product' ? [{ label: '承诺收入', value: numberLabel(form.value.commitment) }] : []),
  ...(typeFields[type.value] || []).map(field => ({
    label: field.label.replace('（万元）', ''),
    value: field.numeric ? numberLabel(form.value.application?.[field.key]) : form.value.application?.[field.key] || '未填写',
  })),
])
const milestones = computed(() => new Map(form.value.milestones.map(item => [item.id, item.name])))
const selectedRule = ref(null)
const activeQuote = ref(null)
const sourceTexts = new Map()
const attachmentPanels = new Map()
const analysisOpen = ref(false)
const findings = computed(() => reviewFindings(version.value.ai.result))
const record = computed(() => props.project.reviews.find(item => item.number === versionNumber.value))
const historical = computed(() => versionNumber.value !== latest.value.number)
const isApprover = computed(() => props.role === 'approver')
const canDecide = computed(() => isApprover.value && props.project.status === 'pending' && !historical.value)
const threadKey = computed(() => JSON.stringify([props.scenario, props.role, props.project.id, versionNumber.value]))
const messages = computed(() => props.chats.get(threadKey.value) || [])
const ask = (question, history) => props.api.askReview(props.project.id, versionNumber.value, question, history)
const overview = computed(() => ({ role: 'assistant', ...ask('评审概览') }))
const suggestions = computed(() => [
  '有哪些材料缺口？', '评审依据是什么？',
  type.value === 'research' ? '如何评估验证方案和复用价值？' : '投资回报怎么看？',
  '审批前要核实什么？',
])
const modal = ref('')
const reason = ref('')
const error = ref('')

watch(versionNumber, () => {
  activeQuote.value = null
  analysisOpen.value = false
  modal.value = ''
})

function askAssistant(question) {
  if (!isApprover.value) return
  const answer = ask(question, messages.value)
  if (!props.chats.has(threadKey.value)) props.chats.set(threadKey.value, [])
  props.chats.get(threadKey.value).push({ role: 'user', text: question }, { role: 'assistant', ...answer })
}

function versionPath(number) {
  const base = props.desk ? '/workspace/' + props.project.id : '/project/' + props.project.id + '/review'
  return base + (number === latest.value.number ? '' : '?v=' + number)
}

function openRule(rule) {
  selectedRule.value = rule === reviewRule.id && !version.value.form.application ? reviewRule : policySource(rule)
  if (selectedRule.value) modal.value = 'rule'
}
function openChatSource(item) {
  if (item.file) focusQuote(item.file, item.quote)
  else openRule(item.rule)
}
function registerSource(collection, id, element) {
  if (element) collection.set(id, element)
  else collection.delete(id)
}
async function focusQuote(id, text) {
  const source = sourceTexts.get(id)
  if (!source) return
  activeQuote.value = text ? { id, text } : null
  const attachment = attachmentPanels.get(id)
  if (attachment) attachment.open = true
  await nextTick()
  source.focus()
}
function openDecision(type) {
  modal.value = type
  reason.value = ''
  error.value = ''
}
function decide() {
  try {
    const action = modal.value
    props.api.decide(props.project, versionNumber.value, action, reason.value)
    modal.value = ''
    emit('notify', action === 'return' ? '已退回项目负责人补件' : '已批准立项，项目进入执行中')
    emit('navigate', '/approvals')
  } catch (exception) {
    error.value = exception.message
  }
}
function retry() {
  try {
    props.api.retryReview(props.project, version.value)
  } catch (exception) {
    emit('notify', exception.message, true)
  }
}
</script>

<template>
  <section class="review-view" aria-label="立项评审">
    <div class="desk-folio">
      <div class="review-dossier-head">
        <div><p>立项申报单</p><h2>{{ form.name }}</h2></div>
        <div class="review-dossier-tools">
          <label class="version-select"><span>提交版本</span><select :value="versionNumber" @change="emit('navigate', versionPath(Number($event.target.value)))">
            <option v-for="item in [...project.versions].reverse()" :key="item.number" :value="item.number">v{{ item.number }}{{ item.number === latest.number ? ' · 最新' : '' }}</option>
          </select></label>
          <a v-if="desk" href="#/approvals/history" class="button secondary">查看评审记录<IconArrowUpRight :size="16" aria-hidden="true" /></a>
        </div>
      </div>
      <div v-if="historical" class="review-historical">
        <IconHistory :size="18" aria-hidden="true" />
        <span>历史提交 v{{ versionNumber }}</span>
        <a :href="'#' + versionPath(latest.number)" class="text-button">回到最新版本<IconArrowRight :size="16" aria-hidden="true" /></a>
      </div>
      <div :key="versionNumber" class="review-submission">
        <section class="review-submission-section">
          <h3>基本信息</h3>
          <dl class="review-field-grid">
            <div><dt>项目类型</dt><dd>{{ form.category || '未填写' }}</dd></div>
            <div><dt>关联年度目标</dt><dd>{{ goal ? goal.year + ' 年度 · ' + goal.name : '未关联' }}</dd></div>
            <div><dt>项目起始日期</dt><dd>{{ form.startDate || '未填写' }}</dd></div>
            <div><dt>申请人</dt><dd>{{ roles[project.ownerId]?.name || '未记录' }}</dd></div>
            <div><dt>提交时间</dt><dd><time v-if="version.submittedAt" :datetime="version.submittedAt">{{ submittedAt.format(new Date(version.submittedAt)) }}</time><span v-else>未记录</span></dd></div>
            <div v-if="version.approval"><dt>提交至</dt><dd>{{ version.approval.label }} {{ version.approval.name }}</dd></div>
          </dl>
        </section>
        <section class="review-submission-section">
          <h3>{{ type === 'research' ? '技术问题' : '客户需求' }}</h3>
          <ReviewDocumentText :ref="el => registerSource(sourceTexts, 'brief', el)" :body="form.description"
            :quote="activeQuote?.id === 'brief' ? activeQuote.text : undefined" />
        </section>
        <section v-if="specialistFields.length" class="review-submission-section">
          <h3>{{ type === 'research' ? '技术方案' : '投资与收入' }}</h3>
          <dl class="review-field-grid" :class="{ 'review-field-grid-long': type === 'research' }">
            <div v-for="field in specialistFields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div>
          </dl>
        </section>
        <section class="review-submission-section">
          <h3>里程碑计划</h3>
          <table v-if="form.milestones.length" class="review-milestones" aria-label="提交的里程碑计划">
            <thead><tr><th scope="col">里程碑</th><th scope="col">计划日期</th><th scope="col">前置里程碑</th></tr></thead>
            <tbody>
              <tr v-for="item in form.milestones" :key="item.id">
                <th scope="row">{{ item.name || '未命名' }}</th><td>{{ item.planned || '未填写' }}</td>
                <td>{{ item.dependsOn ? milestones.get(item.dependsOn) || '未找到对应里程碑' : '无' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted">本版未提交里程碑。</p>
        </section>
        <section class="review-submission-section">
          <h3>申报附件<span class="review-section-count">{{ form.materials.length }} 份</span></h3>
          <div v-if="form.materials.length" class="review-attachments">
            <details v-for="attachment in form.materials" :key="attachment.id" :ref="el => registerSource(attachmentPanels, attachment.id, el)">
              <summary><IconFileText :size="17" aria-hidden="true" />{{ attachment.title || '未命名附件' }}</summary>
              <ReviewDocumentText :ref="el => registerSource(sourceTexts, attachment.id, el)" :body="attachment.body"
                :quote="activeQuote?.id === attachment.id ? activeQuote.text : undefined" />
            </details>
          </div>
          <p v-else class="muted">本版未提交附件。</p>
        </section>
      </div>
    </div>

    <section class="desk-folio review-analysis" aria-label="评审辅助">
      <header v-if="isApprover" class="review-analysis-head">
        <h3>评审辅助</h3>
        <button type="button" class="button secondary" :aria-expanded="analysisOpen" aria-controls="review-assistant-panel" @click="analysisOpen = !analysisOpen">
          <IconMessageCircle :size="18" aria-hidden="true" />{{ analysisOpen ? '收起 AI 分析' : messages.length ? '继续 AI 分析' : '发起 AI 分析' }}
        </button>
      </header>
      <div v-if="isApprover" id="review-assistant-panel" :hidden="!analysisOpen">
        <ReviewAssistant v-if="analysisOpen" :key="threadKey" :version="versionNumber" :overview="overview"
          :messages="messages" :suggestions="suggestions" @question="askAssistant" @source="openChatSource" />
      </div>
      <component :is="isApprover ? 'details' : 'section'" class="review-verification">
        <summary v-if="isApprover">材料核查</summary>
        <h3 v-else>材料核查</h3>
        <div class="review-verification-body">
          <p v-if="version.ai.status === 'processing'" class="inline-state muted" role="status"><IconLoader2 class="spin" :size="18" aria-hidden="true" />正在核查材料</p>
          <div v-if="version.ai.status === 'failed'" class="inline-alert" role="status"><strong>核查未完成</strong><p>{{ version.ai.error }}</p><button v-if="canDecide" type="button" class="text-button" @click="retry">重试核查</button></div>
          <article v-for="(issue, index) in findings" :key="index" class="review-finding">
            <header><h4>{{ issue.title || policySource(issue.source)?.title }}</h4><span class="agent-level" :data-level="issue.level">{{ issue.level }}</span></header>
            <p>{{ issue.message }}</p>
            <div class="desk-inline-actions">
              <button v-if="issue.evidence" type="button" class="text-button" @click="focusQuote(issue.evidence.id, issue.evidence.text)">定位原文</button>
              <button type="button" class="text-button" @click="openRule(issue.source)">查看条款</button>
            </div>
          </article>
        </div>
      </component>
    </section>

    <section class="desk-folio" aria-labelledby="review-decision-heading">
      <div class="review-decision">
        <h3 id="review-decision-heading">{{ canDecide ? '审批决定' : '版本状态' }}</h3>
        <div v-if="canDecide" class="decision-actions">
          <button class="button secondary" type="button" @click="openDecision('return')">退回补件</button>
          <button class="button primary" type="button" @click="openDecision('approve')">批准立项</button>
        </div>
        <div v-else class="decision-body">
          <div v-if="record" class="decision-outcome">
            <strong>{{ record.action === 'return' ? '已退回补件' : '已批准立项' }}</strong>
            <p v-if="record.reason">{{ record.reason }}</p><p class="muted">{{ record.by }} · {{ dateTime(record.at) }}</p>
          </div>
          <p v-else class="muted">等待产品线审批人处理。</p>
        </div>
      </div>
      <details v-if="project.versions.length > 1" class="review-history">
        <summary>提交记录</summary>
        <ul class="task-list">
          <li v-for="item in [...project.versions].reverse()" :key="item.number">
            <a class="version-row" :href="'#' + versionPath(item.number)" :aria-current="item.number === versionNumber ? 'true' : undefined">
              <span class="number">v{{ item.number }}</span>
              <span>{{ project.reviews.find(review => review.number === item.number)?.action === 'return' ? '已退回' : item.number === project.approvedVersion ? '已批准' : '已提交' }}</span>
              <time :datetime="item.submittedAt" class="muted">{{ dateTime(item.submittedAt) }}</time>
            </a>
          </li>
        </ul>
      </details>
    </section>

    <Modal v-if="modal === 'rule'" title="准入条款" side @close="modal = ''">
      <div class="agent-reader"><article><span class="agent-meta">{{ selectedRule?.id }} · {{ selectedRule?.version || version.policyVersion }}</span><h3>{{ selectedRule?.title }}</h3><p>{{ selectedRule?.text }}</p></article></div>
    </Modal>
    <Modal v-else-if="modal" :side="modal === 'return'" :title="modal === 'return' ? '退回补件' : '批准立项'" @close="modal = ''">
      <form class="dialog-form" @submit.prevent="decide">
        <p>{{ modal === 'return' ? '项目负责人将收到退回原因，并可提交新版本。' : '项目将进入执行中，本次提交成为承诺收入和里程碑计划的依据。' }}</p>
        <label v-if="modal === 'return'">退回原因<textarea v-model="reason" required rows="5" placeholder="写清需要补充的材料或说明" /></label>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <div class="modal-actions">
          <button class="button secondary" type="button" @click="modal = ''">取消</button>
          <button class="button primary" type="submit">{{ modal === 'return' ? '确认退回' : '确认批准' }}</button>
        </div>
      </form>
    </Modal>
  </section>
</template>
