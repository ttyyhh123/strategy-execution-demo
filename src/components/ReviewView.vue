<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  IconAlertTriangle, IconArrowRight, IconCircleCheck, IconFileText, IconHistory,
  IconLoader2, IconSparkles,
} from '@tabler/icons-vue'
import { currentVersion, dateTime, projectFiles, reviewRule, roles } from '../domain.js'
import Modal from './Modal.vue'

const props = defineProps({ project: Object, role: String, versionHint: Number, api: Object })
const emit = defineEmits(['notify', 'navigate'])
const latest = computed(() => currentVersion(props.project))
const versionNumber = ref(latest.value.number)
const version = computed(() => props.project.versions.find(item => item.number === versionNumber.value))
const finding = computed(() => version.value.ai.result)
const files = computed(() => projectFiles(version.value.form))
const selectedFile = ref('')
const readerTab = ref('source')
const sourceFocus = ref(false)
const excerpt = ref(null)
const file = computed(() => files.value.find(item => item.id === selectedFile.value) ?? files.value[0])
const record = computed(() => props.project.reviews.find(item => item.number === versionNumber.value))
const historical = computed(() => versionNumber.value !== latest.value.number)
const canDecide = computed(() => props.role === 'approver' && props.project.status === 'pending' && !historical.value)
const reviewLabels = { met: '已满足', insufficient: '证据不足', missing: '缺失' }
const modal = ref('')
const reason = ref('')
const error = ref('')

watch([() => props.versionHint, () => latest.value.number], ([hint, current]) => {
  versionNumber.value = props.project.versions.some(item => item.number === hint) ? hint : current
}, { immediate: true })

function versionPath(number) {
  return '/project/' + props.project.id + '/review' + (number === latest.value.number ? '' : '?v=' + number)
}

function switchVersion(event) {
  emit('navigate', versionPath(Number(event.target.value)))
}

const blocks = computed(() => file.value.body.split('\n').map((line, index) => {
  const evidence = finding.value?.evidence
  const quote = evidence?.id === file.value.id ? evidence.text : ''
  const start = quote ? line.indexOf(quote) : -1
  return {
    key: index, line, heading: /^[一二三四五六七八九十]+、/u.test(line),
    highlight: start >= 0 ? [line.slice(0, start), quote, line.slice(start + quote.length)] : null,
  }
}).filter(item => item.line.trim()))

async function openReader(tab, id, focusEvidence = false) {
  selectedFile.value = id || finding.value?.evidence?.id || files.value[0].id
  readerTab.value = tab
  sourceFocus.value = focusEvidence
  modal.value = 'reader'
  if (focusEvidence) await focusQuote()
}
async function focusQuote() {
  await nextTick()
  excerpt.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  excerpt.value?.focus({ preventScroll: true })
}
function openSourceTab() {
  readerTab.value = 'source'
  if (sourceFocus.value) focusQuote()
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
    <div v-if="historical" class="history-banner">
      <IconHistory :size="19" aria-hidden="true" />
      <span>正在查看历史提交 v{{ versionNumber }}</span>
      <a :href="'#' + versionPath(latest.number)" class="text-button">回到最新版本<IconArrowRight :size="16" aria-hidden="true" /></a>
    </div>

    <div class="review-grid">
      <div class="review-main stack">
        <section class="surface work-panel">
          <header class="work-panel-head">
            <div class="heading-with-icon"><IconSparkles :size="20" aria-hidden="true" /><h2>AI 核查</h2></div>
            <label class="version-select">
              <span>提交版本</span>
              <select :value="versionNumber" @change="switchVersion">
                <option v-for="item in [...project.versions].reverse()" :key="item.number" :value="item.number">
                  v{{ item.number }}{{ item.number === latest.number ? ' · 最新' : '' }}
                </option>
              </select>
            </label>
          </header>

          <div class="review-section-body">
            <div v-if="version.ai.status === 'processing'" class="inline-alert neutral-state" role="status">
              <div class="inline-state"><IconLoader2 class="spin" :size="18" aria-hidden="true" /><strong>核查处理中</strong></div>
              <p>可以先查看申请材料。</p>
            </div>
            <div v-if="version.ai.status === 'failed'" class="inline-alert" role="status">
              <strong>核查未完成</strong><p>{{ version.ai.error }}</p>
              <button v-if="canDecide" type="button" class="text-button" @click="retry">重试核查</button>
            </div>
            <div v-if="finding" class="finding-card">
              <div class="finding-main">
                <div class="finding-title"><h3>客户试用说明</h3><span class="result-label" :data-result="finding.status">
                  <IconCircleCheck v-if="finding.status === 'met'" :size="16" aria-hidden="true" />
                  <IconAlertTriangle v-else :size="16" aria-hidden="true" />{{ reviewLabels[finding.status] }}
                </span></div>
                <p class="muted">{{ finding.suggestion }}</p>
              </div>
              <button class="button secondary small" type="button" @click="openReader(finding.evidence ? 'source' : 'rule', finding.evidence?.id, !!finding.evidence)">
                查看依据<IconArrowRight :size="16" aria-hidden="true" />
              </button>
              <blockquote v-if="finding.evidence">{{ finding.evidence.text }}<cite>{{ finding.evidence.title }} · v{{ version.number }}</cite></blockquote>
            </div>
          </div>
        </section>

        <section class="surface work-panel">
          <header class="work-panel-head"><div class="heading-with-icon"><IconFileText :size="20" aria-hidden="true" /><h2>申请材料</h2></div><span class="muted">v{{ versionNumber }} · {{ files.length }} 份</span></header>
          <ul class="task-list">
            <li v-for="item in files" :key="item.id" class="file-row">
              <IconFileText :size="20" aria-hidden="true" /><button type="button" class="file-link" @click="openReader('source', item.id)">{{ item.title }}</button>
              <IconArrowRight :size="16" aria-hidden="true" />
            </li>
          </ul>
        </section>
      </div>

      <aside class="review-side stack" aria-label="审批操作和流转记录">
        <section class="surface work-panel">
          <header class="work-panel-head"><h2>{{ canDecide ? '审批决定' : '版本状态' }}</h2></header>
          <div class="review-section-body decision-body">
            <dl class="description-list">
              <dt>提交版本</dt><dd>v{{ versionNumber }}</dd>
              <dt>项目负责人</dt><dd>{{ roles.owner.name }}</dd>
              <dt>提交时间</dt><dd>{{ dateTime(version.submittedAt) }}</dd>
            </dl>
            <template v-if="canDecide">
              <div class="decision-actions">
                <button class="button primary" type="button" @click="openDecision('approve')">批准立项</button>
                <button class="button secondary" type="button" @click="openDecision('return')">退回补件</button>
              </div>
              <p class="muted decision-note">审批提交后将返回待审批队列。</p>
            </template>
            <div v-else-if="record" class="decision-outcome">
              <strong>{{ record.action === 'return' ? '已退回补件' : '已批准立项' }}</strong>
              <p v-if="record.reason">{{ record.reason }}</p><p class="muted">{{ record.by }} · {{ dateTime(record.at) }}</p>
            </div>
            <p v-else class="muted decision-note">等待产品线审批人处理。</p>
          </div>
        </section>

        <section class="surface work-panel">
          <header class="work-panel-head"><div class="heading-with-icon"><IconHistory :size="19" aria-hidden="true" /><h2>提交流转</h2></div></header>
          <ul class="task-list">
            <li v-for="item in [...project.versions].reverse()" :key="item.number">
              <a class="version-row" :href="'#' + versionPath(item.number)" :aria-current="item.number === versionNumber ? 'true' : undefined">
                <span class="number">v{{ item.number }}</span>
                <span>{{ project.reviews.find(review => review.number === item.number)?.action === 'return' ? '已退回' : item.number === project.approvedVersion ? '已批准' : '已提交' }}</span>
                <time :datetime="item.submittedAt" class="muted">{{ dateTime(item.submittedAt) }}</time>
              </a>
            </li>
          </ul>
        </section>
      </aside>
    </div>

    <Modal v-if="modal === 'reader'" title="核查依据与材料" side @close="modal = ''">
      <div class="reader-body">
        <div class="tabs" aria-label="查看依据">
          <button type="button" :aria-pressed="readerTab === 'source'" @click="openSourceTab">材料原文</button>
          <button type="button" :aria-pressed="readerTab === 'rule'" @click="readerTab = 'rule'">准入条款</button>
        </div>
        <template v-if="readerTab === 'source'">
          <label>申请材料<select v-model="selectedFile"><option v-for="item in files" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
          <article class="doc-prose">
            <h3>{{ file.title }}</h3>
            <template v-for="block in blocks" :key="block.key">
              <p v-if="block.highlight" :ref="el => { if (el) excerpt = el }" class="evidence-line" tabindex="-1">
                {{ block.highlight[0] }}<mark>{{ block.highlight[1] }}</mark>{{ block.highlight[2] }}
              </p>
              <h4 v-else-if="block.heading">{{ block.line }}</h4>
              <p v-else>{{ block.line }}</p>
            </template>
          </article>
        </template>
        <section v-else class="rule-document">
          <h3>{{ reviewRule.title }}</h3><p class="muted">{{ reviewRule.id }} · 版本 {{ reviewRule.version }}</p><p>{{ reviewRule.text }}</p>
        </section>
      </div>
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
