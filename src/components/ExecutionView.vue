<script setup>
import { computed, reactive, ref } from 'vue'
import { IconAlertTriangle, IconChevronRight } from '@tabler/icons-vue'
import {
  aiStates, alertStates, dateTime, dayLabel, delayDays, delayThreshold, goalFor, localToday, money, percentage,
} from '../domain.js'
import Modal from './Modal.vue'

const props = defineProps({ project: Object, role: String, tab: String, api: Object })
const emit = defineEmits(['notify'])
const owner = computed(() => props.role === 'owner')
const executing = computed(() => owner.value && props.project.status === 'active')
const goal = computed(() => goalFor(props.project.goalId))
const modal = ref(null)
const error = ref('')
const schedule = reactive({ forecast: '', actual: '', note: '' })
const treatment = reactive({ measure: '', assignee: '', due: '', outcome: '' })
const closing = reactive({ amount: '', source: '', date: localToday(), year: goal.value.year, note: '' })
const milestoneFor = alert => props.project.milestones.find(item => item.id === alert.milestoneId)
const latest = alert => alert.analyses.at(-1)
const recentResult = alert => alert.analyses.findLast(item => item.result)

function open(kind, entry) {
  error.value = ''
  modal.value = { kind, entry }
  if (kind === 'schedule') {
    Object.assign(schedule, { forecast: entry.forecast, actual: entry.actual, note: entry.note })
  } else if (kind === 'handle' || kind === 'closeAlert') {
    Object.assign(treatment, { measure: '', assignee: '', due: '', outcome: '' }, entry.treatment || {})
  }
}

function commit() {
  error.value = ''
  try {
    const { kind, entry } = modal.value
    let message
    if (kind === 'schedule') message = props.api.updateSchedule(props.project, entry.id, schedule)
    if (kind === 'handle') {
      props.api.handleAlert(props.project, entry, treatment)
      message = '已确认处理措施'
    }
    if (kind === 'closeAlert') {
      props.api.closeAlert(props.project, entry, treatment.outcome)
      message = '已关闭延期预警'
    }
    if (kind === 'closeProject') {
      props.api.closeProject(props.project, closing)
      message = '已结项，确认收入已归入年度目标'
    }
    modal.value = null
    emit('notify', message)
  } catch (exception) {
    error.value = exception.message
  }
}

function analyze(alert) {
  try {
    props.api.analyze(props.project, alert)
    emit('notify', '已提交 AI 延期分析')
  } catch (exception) {
    emit('notify', exception.message, true)
  }
}

const title = computed(() => ({
  schedule: '更新里程碑', handle: '确认处理措施', closeAlert: '关闭预警', closeProject: '确认项目结项',
})[modal.value?.kind] || '')
</script>

<template>
  <section v-if="tab === 'progress'" class="stack">
    <section class="surface section-panel">
      <div class="section-head">
        <div><h2>关键里程碑</h2><p class="muted">未完成的里程碑，预计完成日期比原计划晚超过 {{ delayThreshold }} 个自然日时触发预警。</p></div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>里程碑</th><th>原计划</th><th>预计完成</th><th>实际完成</th><th>预计延期</th><th v-if="executing">操作</th></tr></thead>
          <tbody>
            <template v-for="item in project.milestones" :key="item.id">
              <tr>
                <th scope="row">{{ item.name }}</th>
                <td><strong>{{ dayLabel(item.planned, project.startDate) }}</strong><small>{{ item.planned }}</small></td>
                <td><strong>{{ dayLabel(item.forecast, project.startDate) }}</strong><small>{{ item.forecast }}</small></td>
                <td>{{ item.actual ? dayLabel(item.actual, project.startDate) : '—' }}<small v-if="item.actual">{{ item.actual }}</small></td>
                <td><span :class="{ 'warning-text': delayDays(item.forecast, item.planned) > delayThreshold }">{{ delayDays(item.forecast, item.planned) }} 天</span></td>
                <td v-if="executing"><button class="text-button" type="button" @click="open('schedule', item)">更新进度<span class="sr-only"> · {{ item.name }}</span></button></td>
              </tr>
              <tr v-if="item.note || item.history?.length" class="subrow">
                <td :colspan="executing ? 6 : 5">
                  <details><summary>{{ item.note || '查看进度更新记录' }}</summary>
                    <p v-for="(history, index) in item.history || []" :key="index">{{ dateTime(history.at) }} · {{ history.by }} · 预计 {{ history.forecast }}<span v-if="history.actual"> · 实际 {{ history.actual }}</span><span v-if="history.note"> · {{ history.note }}</span></p>
                  </details>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <section class="surface section-panel">
      <div class="section-head"><h2>延期预警</h2><span class="muted">{{ project.alerts.filter(alert => alert.state !== 'closed').length }} 条待跟进</span></div>
      <p v-if="!project.alerts.length" class="empty-inline muted">当前没有延期预警。</p>
      <article v-for="alert in [...project.alerts].reverse()" :id="alert.id" :key="alert.id" class="alert-item" tabindex="-1">
        <div class="section-head">
          <div class="alert-title"><IconAlertTriangle :size="22" /><h3>{{ milestoneFor(alert).name }}</h3><span class="status" :data-status="alert.state">{{ alertStates[alert.state] }}</span></div>
          <strong class="warning-text">延期 {{ alert.delay }} 天</strong>
        </div>
        <p class="muted">原计划 {{ dayLabel(alert.planned, project.startDate) }} · 预计 {{ dayLabel(alert.forecast, project.startDate) }}</p>
        <a class="text-button" :href="'#/risks/' + project.id + '?alert=' + encodeURIComponent(alert.id)">查看与分析预警<IconChevronRight :size="16" aria-hidden="true" /></a>
        <details class="analysis-block">
          <summary>分析记录<span v-if="latest(alert)" class="muted"> · {{ aiStates[latest(alert).status] }}</span></summary>
          <p v-if="latest(alert)?.error" class="field-error">{{ latest(alert).error }}</p>
          <template v-if="recentResult(alert)">
            <p v-if="recentResult(alert).input.forecast !== alert.forecast" class="warning-text">下方分析基于历史预计日期。</p>
            <dl class="description-list">
              <dt>影响</dt><dd>{{ recentResult(alert).result.impact }}</dd>
              <dt>原因</dt><dd>{{ recentResult(alert).result.cause }}</dd>
              <dt>依据</dt><dd>{{ recentResult(alert).result.evidence }}</dd>
              <dt>建议</dt><dd>{{ recentResult(alert).result.suggestion }}</dd>
            </dl>
          </template>
          <button v-if="owner && alert.state !== 'closed' && latest(alert)?.status !== 'processing'" type="button" class="text-button" @click="analyze(alert)">
            {{ latest(alert)?.status === 'failed' ? '重试分析' : '重新分析' }}
          </button>
        </details>
        <dl v-if="alert.treatment || alert.state === 'closed'" class="description-list treatment-list">
          <template v-if="alert.treatment">
            <dt>处理措施</dt><dd>{{ alert.treatment.measure }}</dd>
            <dt>责任人</dt><dd>{{ alert.treatment.assignee }}</dd><dt>截止日期</dt><dd>{{ alert.treatment.due }}</dd>
            <dt>确认记录</dt><dd>{{ alert.treatment.by }} · {{ dateTime(alert.treatment.at) }}</dd>
          </template>
          <template v-if="alert.state === 'closed'"><dt>处理结果</dt><dd>{{ alert.outcome }} · {{ alert.closedBy }} {{ dateTime(alert.closedAt) }}</dd></template>
        </dl>
        <div v-if="owner && alert.state !== 'closed'" class="inline-actions">
          <button v-if="alert.state === 'working' || alert.delay <= delayThreshold" class="button secondary" type="button" @click="open('closeAlert', alert)">关闭预警</button>
          <button class="button primary" type="button" @click="open('handle', alert)">{{ alert.state === 'open' ? '确认处理措施' : '更新处理措施' }}</button>
        </div>
      </article>
    </section>
  </section>

  <section v-else class="surface section-panel">
    <div class="section-head"><h2>结项与确认收入</h2><a class="text-button" href="#/dashboard">查看年度目标<IconChevronRight :size="16" /></a></div>
    <div v-if="project.closing">
      <div class="summary-metrics three">
        <div><span>确认收入</span><strong>{{ money(project.closing.amount) }}</strong></div>
        <div><span>项目达成率</span><strong>{{ percentage(project.closing.amount, project.commitment) }}</strong><small>{{ money(project.closing.amount) }} ÷ {{ money(project.commitment) }}</small></div>
        <div><span>年度目标贡献</span><strong>{{ percentage(project.closing.amount, goal.amount) }}</strong><small>{{ money(project.closing.amount) }} ÷ {{ money(goal.amount) }}</small></div>
      </div>
      <dl class="description-list closing-record">
        <dt>收入所属年度</dt><dd>{{ project.closing.year }} 年</dd>
        <dt>财务确认来源</dt><dd>{{ project.closing.source }}</dd>
        <dt>财务确认日期</dt><dd>{{ project.closing.date }}</dd>
        <dt>说明</dt><dd>{{ project.closing.note || '—' }}</dd>
        <dt>登记记录</dt><dd>{{ project.closing.by }} · {{ dateTime(project.closing.at) }}</dd>
      </dl>
    </div>
    <form v-else-if="executing" class="closing-form" @submit.prevent="open('closeProject')">
      <p class="muted">登记财务已确认的本年度收入。结项后，该笔收入计入对应年度目标。</p>
      <div class="form-grid">
        <label>确认收入（万元）<input v-model="closing.amount" type="number" step="0.01" min="0" required placeholder="输入金额" /></label>
        <label>收入所属年度<select v-model="closing.year"><option :value="goal.year">{{ goal.year }} 年</option></select></label>
        <label>财务确认来源<input v-model="closing.source" required placeholder="如财务确认记录编号" /></label>
        <label>财务确认日期<input v-model="closing.date" type="date" required /></label>
      </div>
      <label>确认说明<textarea v-model="closing.note" rows="3" placeholder="补充记录范围或口径" /></label>
      <div class="inline-actions"><button class="button primary" type="submit">确认结项</button></div>
    </form>
    <p v-else class="muted empty-inline">项目尚未结项，确认收入待登记。</p>
  </section>

  <Modal v-if="modal" :title="title" :side="modal.kind !== 'closeProject'" @close="modal = null">
    <form class="dialog-form" @submit.prevent="commit">
      <template v-if="modal.kind === 'schedule'">
        <p class="muted">{{ modal.entry.name }} · 原计划 {{ dayLabel(modal.entry.planned, project.startDate) }}</p>
        <label>预计完成日期<input v-model="schedule.forecast" type="date" required /></label>
        <label>实际完成日期（选填）<input v-model="schedule.actual" type="date" /></label>
        <label>进度说明<textarea v-model="schedule.note" rows="3" placeholder="说明进度变化或已知延期原因" /></label>
      </template>
      <template v-else-if="modal.kind === 'handle'">
        <div v-if="recentResult(modal.entry)" class="adopt-suggestion">
          <p>{{ recentResult(modal.entry).result.suggestion }}</p>
          <button type="button" class="text-button" @click="treatment.measure = recentResult(modal.entry).result.suggestion">将 AI 建议填入措施</button>
        </div>
        <label>处理措施<textarea v-model="treatment.measure" required rows="3" placeholder="填写已确认的处理措施" /></label>
        <label>责任人<input v-model="treatment.assignee" required placeholder="填写负责人" /></label>
        <label>截止日期<input v-model="treatment.due" type="date" required /></label>
      </template>
      <label v-else-if="modal.kind === 'closeAlert'">处理结果<textarea v-model="treatment.outcome" required rows="3" placeholder="说明已完成的处理结果" /></label>
      <p v-else>确认将 {{ money(Number(closing.amount)) }} 归入 {{ goal.year }} 年度目标。结项记录将进入只读状态。</p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="modal-actions">
        <button class="button secondary" type="button" @click="modal = null">取消</button>
        <button class="button primary" type="submit">{{ modal.kind === 'schedule' ? '保存进度' : title }}</button>
      </div>
    </form>
  </Modal>
</template>
