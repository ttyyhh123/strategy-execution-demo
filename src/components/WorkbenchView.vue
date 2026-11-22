<script setup>
import { computed } from 'vue'
import {
  IconAlertTriangle, IconArrowRight, IconChartBar, IconCircleCheck, IconClipboardList, IconClock,
  IconFileDescription, IconFolder, IconPlus, IconSparkles, IconTarget,
} from '@tabler/icons-vue'
import { aiStates, currentVersion, dateTime, goalTotals, goals, money, percentage, projectStates } from '../domain.js'

const props = defineProps({ role: String, projects: Array, activity: { type: Array, default: () => [] } })
const goal = goals[0]
const projectsInExecution = computed(() => props.projects.filter(item => item.status === 'active'))
const pending = computed(() => props.projects.filter(item => item.status === 'pending'))
const actioned = computed(() => props.projects.reduce((amount, item) => amount + item.reviews.length, 0))
const totals = computed(() => goalTotals(props.projects, goal))
const path = (project, page) => '#/project/' + project.id + '/' + page
const descriptions = {
  approver: '集中处理立项申请，查看核查进度和审批记录。',
  owner: '跟进申报、补件和执行预警。',
  manager: '查看年度目标进度，跟进影响交付的项目风险。',
}

const stats = computed(() => {
  if (props.role === 'approver') return [
    { label: '待我审批', value: pending.value.length, href: '#/approvals', icon: IconClipboardList },
    { label: '待审申请已核查', value: pending.value.filter(item => currentVersion(item).ai.status === 'done').length, href: '#/approvals/checked', icon: IconSparkles },
    { label: '已处理审批', value: actioned.value, href: '#/approvals/history', icon: IconCircleCheck },
  ]
  if (props.role === 'manager') return [
    { label: '年度目标达成率', value: percentage(totals.value.income, goal.amount), href: '#/dashboard', icon: IconTarget },
    { label: '执行中项目', value: projectsInExecution.value.length, href: '#/projects/active', icon: IconFolder },
    { label: '未关闭预警', value: totals.value.openAlerts.length, href: '#/dashboard/risks', icon: IconAlertTriangle },
  ]
  return [
    { label: '待补件', value: props.projects.filter(item => item.status === 'returned').length, href: '#/projects/returned', icon: IconFileDescription },
    { label: '执行中项目', value: projectsInExecution.value.length, href: '#/projects/active', icon: IconFolder },
    { label: '待处理预警', value: totals.value.openAlerts.length, href: '#/dashboard/risks', icon: IconAlertTriangle },
  ]
})

const tasks = computed(() => {
  if (props.role === 'approver') {
    return pending.value.map(project => ({
      id: project.id, name: project.name, kind: '立项审批', state: 'pending',
      detail: 'v' + currentVersion(project).number + ' · AI 核查' + aiStates[currentVersion(project).ai.status],
      href: path(project, 'review'), action: '开始评审',
    }))
  }

  const risks = totals.value.openAlerts.map(({ project, alert }) => ({
    id: alert.id, projectId: project.id, name: project.name, kind: '延期预警', state: 'open',
    detail: project.milestones.find(item => item.id === alert.milestoneId)?.name + ' · 延期 ' + alert.delay + ' 天',
    href: path(project, 'progress') + '?alert=' + alert.id, action: props.role === 'manager' ? '查看风险' : '处理预警',
  }))
  if (props.role === 'manager') return risks

  const applications = props.projects.filter(project => ['draft', 'returned'].includes(project.status)).map(project => ({
    id: project.id, name: project.name, kind: projectStates[project.status], state: project.status,
    detail: project.status === 'returned' ? project.reviews.at(-1)?.reason : '确认申报信息后提交立项申请',
    href: path(project, 'edit'), action: project.status === 'returned' ? '补充材料' : '继续申报',
  }))
  const updates = projectsInExecution.value.filter(project => !risks.some(risk => risk.projectId === project.id)).map(project => ({
    id: project.id, name: project.name, kind: '执行中', state: 'active', detail: '登记里程碑进度或确认收入',
    href: path(project, 'progress'), action: '更新进度',
  }))
  return [...risks, ...applications, ...updates]
})

const derivedActivity = computed(() => props.projects.flatMap(project => [
  ...project.reviews.map(review => ({
    id: project.id + '-r' + review.number, name: project.name,
    label: review.action === 'approve' ? '批准立项' : '退回补件',
    version: review.number, at: review.at, href: path(project, 'review') + '?v=' + review.number,
  })),
  ...project.versions.map(version => ({
    id: project.id + '-v' + version.number, name: project.name,
    label: version.number > 1 ? '提交补件' : '提交申请',
    version: version.number, at: version.submittedAt, href: path(project, 'review') + '?v=' + version.number,
  })),
]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4))

// 优先展示云端流转留痕：跨设备、跨角色的提交与处理都会记录在数据库里。
const activity = computed(() => props.activity.length ? props.activity.map(item => ({
  id: 'log-' + item.id, label: item.action, name: item.project_name || '工作区',
  version: item.version || null, at: item.created_at, href: item.href || '',
})) : derivedActivity.value)
</script>

<template>
  <section class="page-wrap stack hub-page">
    <header class="page-heading">
      <div><h1>工作台</h1><p>{{ descriptions[role] }}</p></div>
      <a v-if="role === 'owner'" class="button" :class="tasks.length ? 'secondary' : 'primary'" href="#/new"><IconPlus :size="19" aria-hidden="true" />新建项目</a>
    </header>

    <div class="work-metrics" aria-label="工作概况">
      <a v-for="item in stats" :key="item.label" :href="item.href" class="surface work-metric">
        <div class="work-metric-label"><component :is="item.icon" :size="19" aria-hidden="true" />{{ item.label }}</div>
        <strong class="number">{{ item.value }}</strong><IconArrowRight class="metric-arrow" :size="18" aria-hidden="true" />
      </a>
    </div>

    <div class="work-columns">
      <section class="surface work-panel work-primary">
        <header class="work-panel-head">
          <div class="heading-with-icon"><IconClipboardList :size="19" aria-hidden="true" /><h2>{{ role === 'manager' ? '风险待关注' : '待办事项' }}</h2></div>
          <a v-if="role === 'approver'" class="text-button" href="#/approvals">全部审批<IconArrowRight :size="16" aria-hidden="true" /></a>
          <a v-else class="text-button" href="#/projects">项目台账<IconArrowRight :size="16" aria-hidden="true" /></a>
        </header>
        <ul v-if="tasks.length" class="task-list">
          <li v-for="(item, index) in tasks" :key="item.id" class="task-row">
            <div class="task-info">
              <div class="task-title"><h3>{{ item.name }}</h3><span class="status" :data-status="item.state">{{ item.kind }}</span></div>
              <p class="muted">{{ item.detail }}</p>
            </div>
            <a class="button small" :class="index === 0 ? 'primary' : 'secondary'" :href="item.href">{{ item.action }}<IconArrowRight :size="16" aria-hidden="true" /></a>
          </li>
        </ul>
        <div v-else class="empty-state"><IconCircleCheck :size="26" aria-hidden="true" /><h3>当前没有待处理事项</h3>
          <p>新的申请、补件或预警会出现在这里。</p></div>
      </section>

      <section class="surface work-panel goal-brief">
        <header class="work-panel-head"><div class="heading-with-icon"><IconTarget :size="19" aria-hidden="true" /><h2>年度目标</h2></div><span class="muted">{{ goal.year }} 年度</span></header>
        <div class="goal-brief-body">
          <p>{{ goal.name }}</p>
          <strong class="number">{{ money(goal.amount) }}</strong>
          <template v-if="role === 'manager'">
            <progress class="goal-progress" :max="goal.amount" :value="Math.min(totals.income, goal.amount)" aria-label="年度目标进度"></progress>
            <p class="muted">已确认收入 {{ money(totals.income) }}</p>
          </template>
          <p v-else class="muted">{{ goal.guidance }}</p>
          <a href="#/dashboard" class="text-button"><IconChartBar :size="17" aria-hidden="true" />查看战略看板<IconArrowRight :size="16" aria-hidden="true" /></a>
        </div>
      </section>

      <section class="surface work-panel activity-panel">
        <header class="work-panel-head"><div class="heading-with-icon"><IconClock :size="19" aria-hidden="true" /><h2>最近流转</h2></div></header>
        <ul v-if="activity.length" class="task-list">
          <li v-for="item in activity" :key="item.id"><component :is="item.href ? 'a' : 'div'" :href="item.href || undefined" class="activity-row">
            <span class="activity-dot" aria-hidden="true"></span><span><strong>{{ item.label }}</strong><span class="activity-project">{{ item.name }}<template v-if="item.version"> · v{{ item.version }}</template></span></span>
            <time :datetime="item.at" class="muted">{{ dateTime(item.at) }}</time>
          </component></li>
        </ul>
        <p v-else class="empty-inline work-empty muted">提交后，这里会显示申请和审批记录。</p>
      </section>
    </div>
  </section>
</template>
