<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { IconArrowLeft, IconArrowRight, IconPlus } from '@tabler/icons-vue'
import { blankForm, clone, goalFor, goals, makeId, money } from '../domain.js'

const props = defineProps({ project: Object, api: Object })
const emit = defineEmits(['notify', 'navigate'])
const form = reactive(blankForm())
if (props.project) {
  for (const key of Object.keys(form)) form[key] = clone(props.project[key])
}
const goal = computed(() => goalFor(form.goalId))
const latestReturn = computed(() => props.project?.reviews.at(-1))
const steps = [
  { title: '项目概况', detail: '目标、收入与客户需求' },
  { title: '关键里程碑', detail: '计划日期和前置关系' },
  { title: '支持材料', detail: '提交给审批人核查' },
]
const step = ref(props.project?.status === 'returned' ? 2 : 0)
const stepHeading = ref(null)
const error = ref('')
const errorStep = ref(null)
function goTo(index) {
  step.value = index
  nextTick(() => {
    stepHeading.value?.scrollIntoView({ block: 'nearest' })
    stepHeading.value?.focus({ preventScroll: true })
  })
}
function submitStep() {
  if (step.value < steps.length - 1) goTo(step.value + 1)
  else save(true)
}
function addMaterial() {
  form.materials.push({ id: makeId('file'), title: '', body: '' })
}
function addMilestone() {
  form.milestones.push({ id: makeId('milestone'), name: '', planned: '', dependsOn: '' })
}
function save(submit) {
  error.value = ''
  errorStep.value = null
  try {
    const id = props.api.saveForm(form, props.project?.id, submit)
    emit('notify', submit ? '已提交申请，正在进行 AI 核查' : '草稿已保存')
    emit('navigate', '/project/' + id + '/' + (submit ? 'review' : 'overview'))
  } catch (exception) {
    error.value = exception.message
    errorStep.value = exception.message.includes('里程碑') ? 1 : exception.message.includes('每份材料') ? 2 : 0
    goTo(errorStep.value)
  }
}
</script>

<template>
  <section class="page-wrap">
    <header class="page-heading">
      <div><h1>{{ project?.status === 'returned' ? '补充立项材料' : project ? '编辑项目申请' : '新建项目' }}</h1>
        <p>{{ project?.status === 'returned' ? '根据退回意见完善申请后，提交新版本。' : '填写项目资料，可以保存草稿后继续。' }}</p></div>
    </header>
    <div v-if="project?.status === 'returned' && latestReturn?.reason" class="inline-alert return-note">
      <strong>退回原因</strong><p>{{ latestReturn.reason }}</p>
    </div>
    <div class="application-grid">
    <nav class="surface application-steps" aria-label="申请步骤">
      <ol>
        <li v-for="(item, index) in steps" :key="item.title">
          <button type="button" :aria-current="step === index ? 'step' : undefined" @click="goTo(index)">
            <span class="step-number">{{ index + 1 }}</span><span><strong>{{ item.title }}</strong><small>{{ item.detail }}</small></span>
          </button>
        </li>
      </ol>
    </nav>
    <form class="surface project-form" novalidate @submit.prevent="submitStep">
      <header class="work-panel-head"><h2 ref="stepHeading" tabindex="-1">{{ steps[step].title }}</h2><span class="muted">{{ step + 1 }} / {{ steps.length }}</span></header>
      <section v-show="step === 0" class="form-section">
        <div class="form-grid">
          <label>项目名称<input v-model="form.name" maxlength="80" required placeholder="输入项目名称" /></label>
          <label>项目类别<select v-model="form.category"><option>产品研发</option></select></label>
          <label>关联年度目标<select v-model="form.goalId"><option v-for="item in goals" :key="item.id" :value="item.id">{{ item.year }} · {{ item.name }}</option></select></label>
          <label>承诺收入（万元）<input v-model="form.commitment" type="number" min="0.01" step="0.01" required placeholder="输入承诺收入" /></label>
          <label>项目起始日期<input v-model="form.startDate" type="date" required /></label>
          <div class="goal-note"><strong>年度目标 {{ money(goal.amount) }}</strong><span>{{ goal.guidance }}</span></div>
        </div>
        <label class="full-field">任务书与客户需求<textarea v-model="form.description" rows="4" required placeholder="说明客户需要、项目目标和试用安排" /></label>
      </section>
      <section v-show="step === 1" class="form-section">
        <div class="section-head"><p class="muted">登记计划日期和前置节点。</p><button type="button" class="button secondary small" @click="addMilestone"><IconPlus :size="18" aria-hidden="true" />添加里程碑</button></div>
        <p v-if="!form.milestones.length" class="muted empty-inline">提交前至少填写一个里程碑。</p>
        <div v-for="(item, index) in form.milestones" :key="item.id" class="form-grid milestone-fields">
          <label>里程碑 {{ index + 1 }} 名称<input v-model="item.name" required placeholder="输入名称" /></label>
          <label>计划日期<input v-model="item.planned" type="date" required /></label>
          <label>前置里程碑<select v-model="item.dependsOn"><option value="">无</option>
            <option v-for="earlier in form.milestones.slice(0, index)" :key="earlier.id" :value="earlier.id">{{ earlier.name || '待命名里程碑' }}</option>
          </select></label>
        </div>
      </section>
      <section v-show="step === 2" class="form-section">
        <div class="section-head"><p class="muted">录入可供审批人和 AI 核查的原文。</p><button type="button" class="button secondary small" @click="addMaterial"><IconPlus :size="18" aria-hidden="true" />添加材料</button></div>
        <p v-if="!form.materials.length" class="muted empty-inline">可录入客户试用确认等证明，供审批人与 AI 核查。</p>
        <div v-for="(item, index) in form.materials" :key="item.id" class="material-fields">
          <label>材料 {{ index + 1 }} 名称<input v-model="item.title" placeholder="如客户试用说明" /></label>
          <label>材料正文<textarea v-model="item.body" rows="4" placeholder="录入可供审批人查阅的材料原文" /></label>
        </div>
      </section>
      <p v-if="error && errorStep === step" class="field-error application-error" role="alert">{{ error }}</p>
      <div class="form-footer">
        <button v-if="step > 0" type="button" class="text-button previous-step" @click="goTo(step - 1)"><IconArrowLeft :size="17" aria-hidden="true" />上一步</button>
        <button class="button secondary" type="button" @click="save(false)">保存草稿</button>
        <button v-if="step < steps.length - 1" class="button primary" type="button" @click="goTo(step + 1)">下一步<IconArrowRight :size="17" aria-hidden="true" /></button>
        <button v-else class="button primary" type="submit">{{ project?.status === 'returned' ? '提交补件' : '提交审批' }}</button>
      </div>
    </form>
    </div>
  </section>
</template>
