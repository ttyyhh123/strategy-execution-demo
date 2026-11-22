<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  IconAdjustments, IconAlertTriangle, IconArrowUpRight, IconChartBar, IconCheck, IconChevronDown, IconChevronRight,
  IconClipboardList, IconFolder, IconFolderOpen, IconLayoutDashboard, IconPlus, IconSearch, IconSquaresFilled, IconTarget,
} from '@tabler/icons-vue'
import {
  aiStates, alertStates, canEdit, canRead, currentVersion, dateTime, goalFor, goalTotals, goals,
  money, percentage, projectStates, roles,
} from './domain.js'
import { useCloudDemo } from './cloudStore.js'
import ExecutionView from './components/ExecutionView.vue'
import Modal from './components/Modal.vue'
import ProjectForm from './components/ProjectForm.vue'
import ReviewView from './components/ReviewView.vue'
import WorkbenchView from './components/WorkbenchView.vue'

const demo = useCloudDemo()
const { api, status, bootMessage, syncState, syncMessage, syncLabel, activity } = demo
const { data, readable, active } = api
const booting = computed(() => status.value !== 'ready')
const detailsPath = (id, tab) => '/project/' + id + '/' + tab
const home = '/workspace'
const locationPath = () => window.location.hash.slice(1)
const path = ref(locationPath() || home)
const navPanel = ref(null)
const menuOpen = ref('')
const roleButton = ref(null)
const demoButton = ref(null)
const projectQuery = ref('')
const approvalQuery = ref('')
const metricHelp = ref(false)
const toast = ref(null)
let toastTimer

const route = computed(() => {
  const [pathname, query] = path.value.split('?')
  const [, section, id, tab] = pathname.split('/')
  const params = new URLSearchParams(query)
  return { section, id, tab: tab || 'overview', version: Number(params.get('v')) || null, alert: params.get('alert') }
})
const project = computed(() => active.value.projects.find(item => item.id === route.value.id))
const goal = computed(() => goalFor(project.value?.goalId) || goals[0])
const editable = computed(() => canEdit(project.value, data.role))
const approved = computed(() => ['active', 'closed'].includes(project.value?.status))
const projectTabs = computed(() => [
  ['overview', '项目概况'],
  ...(project.value?.versions.length ? [['review', '立项评审']] : []),
  ...(approved.value ? [['progress', '里程碑与预警'], ['close', '结项与贡献']] : []),
])
const goalProjects = computed(() => readable.value.filter(item => ['active', 'closed'].includes(item.status)))
const totals = computed(() => goalTotals(goalProjects.value, goal.value))
const role = computed(() => roles[data.role])
const pending = computed(() => readable.value.filter(item => item.status === 'pending'))
const nav = computed(() => [
  { path: home, label: '工作台', icon: IconLayoutDashboard },
  { path: '/projects', label: '项目台账', icon: IconFolder },
  ...(data.role === 'approver' ? [{ path: '/approvals', label: '审批中心', icon: IconClipboardList, count: pending.value.length }] : []),
  { path: '/dashboard', label: '战略看板', icon: IconChartBar },
])
const activeNav = computed(() => route.value.section === 'project'
  ? (route.value.tab === 'review' && data.role === 'approver' ? '/approvals' : '/projects')
  : route.value.section === 'new' ? '/projects' : '/' + route.value.section)
const currentNav = computed(() => nav.value.find(item => item.path === activeNav.value))
const filter = computed({
  get: () => Object.hasOwn(projectStates, route.value.id) ? route.value.id : '',
  set: value => navigate('/projects' + (value ? '/' + value : '')),
})
const matches = (item, query) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
const listProjects = computed(() => readable.value.filter(item =>
  (!filter.value || item.status === filter.value) && matches(item, projectQuery.value)))
const approvalMode = computed(() => route.value.id === 'history' ? 'history' : 'pending')
const checkedOnly = computed(() => route.value.id === 'checked')
const decisions = computed(() => readable.value.flatMap(item => item.reviews.map(review => ({
  item, number: review.number, at: review.at, label: review.action === 'return' ? '已退回' : '已批准',
  state: review.action === 'return' ? 'returned' : 'active',
}))).sort((a, b) => b.at.localeCompare(a.at)))
const approvalList = computed(() => (approvalMode.value === 'pending' ? pending.value.map(item => ({
  item, number: currentVersion(item).number, at: currentVersion(item).submittedAt,
  label: '待审批', state: 'pending',
})) : decisions.value).filter(entry => matches(entry.item, approvalQuery.value)
  && (!checkedOnly.value || currentVersion(entry.item).ai.status === 'done')))
const reviewVisible = computed(() => route.value.section === 'project' && route.value.tab === 'review'
  && canRead(project.value, data.role) && project.value.versions.length > 0)
const detailVisible = computed(() => route.value.section === 'project' && canRead(project.value, data.role))

function navigate(next) {
  if (path.value !== next) setPath(next)
  if (locationPath() !== next) window.location.hash = next
}
function syncRoute() {
  const next = locationPath() || home
  if (path.value !== next) setPath(next)
  menuOpen.value = ''
}
function setPath(next) {
  const previous = path.value.split('?')[0]
  path.value = next
  nextTick(() => {
    if (focusDestination()) return
    if (previous !== next.split('?')[0]) {
      window.scrollTo(0, 0)
      focusMain()
    }
  })
}
function changeRole(key) {
  data.role = key
  menuOpen.value = ''
  projectQuery.value = ''
  approvalQuery.value = ''
  navigate(home)
  focusMain()
}
function changeScenario(key) {
  data.scenario = key
  changeRole(key === 'flow' ? 'owner' : 'approver')
}
function failureSwitch() {
  active.value.simulateAiFailure = !active.value.simulateAiFailure
  notify(active.value.simulateAiFailure ? '下一次 AI 调用将模拟失败' : '已恢复正常 AI 模拟')
}
function notify(message, error = false) {
  window.clearTimeout(toastTimer)
  toast.value = { message, error }
  toastTimer = window.setTimeout(() => { toast.value = null }, 4000)
}
function clickOutside(event) {
  if (menuOpen.value && !navPanel.value?.contains(event.target)) menuOpen.value = ''
}
function closeMenu(event) {
  if (event.key === 'Escape' && menuOpen.value) {
    const trigger = menuOpen.value === 'role' ? roleButton.value : demoButton.value
    menuOpen.value = ''
    trigger?.focus()
  }
}
function toggleMenu(menu) {
  menuOpen.value = menuOpen.value === menu ? '' : menu
}
function focusMain() {
  document.getElementById('main-content')?.focus()
}
function focusDestination() {
  const { section, id: scope, tab, alert } = route.value
  const id = section === 'dashboard' && scope === 'risks' ? 'dashboard-risks'
    : section === 'project' && tab === 'progress' && alert?.startsWith('alert-') ? alert : null
  const target = id && document.getElementById(id)
  if (!target) return false
  target.scrollIntoView({ block: 'start' })
  target.focus({ preventScroll: true })
  return true
}
function defaultTab(item) {
  if (item.status === 'pending') return 'review'
  if (canEdit(item, data.role) && item.status === 'returned') return 'edit'
  if (item.status === 'active') return 'progress'
  return item.status === 'closed' ? 'close' : 'overview'
}
onMounted(() => {
  demo.start()
  if (!locationPath()) historyReplace(path.value)
  window.addEventListener('hashchange', syncRoute)
  document.addEventListener('pointerdown', clickOutside)
  document.addEventListener('keydown', closeMenu)
  focusDestination()
})
onUnmounted(() => {
  window.removeEventListener('hashchange', syncRoute)
  document.removeEventListener('pointerdown', clickOutside)
  document.removeEventListener('keydown', closeMenu)
  window.clearTimeout(toastTimer)
})
function historyReplace(next) {
  window.history.replaceState(null, '', '#' + next)
}
</script>

<template>
  <section v-if="booting" class="boot-screen" aria-live="polite">
    <div class="boot-card">
      <span class="brand-mark"><IconSquaresFilled aria-hidden="true" :size="26" /></span>
      <h1>企业战略落地智能助手</h1>
      <p v-if="status === 'loading'" class="boot-text">正在连接云端工作区，载入项目与审批记录…</p>
      <template v-else>
        <p class="boot-text boot-error" role="alert">{{ bootMessage }}</p>
        <button class="button primary" type="button" @click="demo.retryBoot()">重新连接</button>
        <p class="boot-hint">项目、材料与审批记录保存在云端，需要可用的网络连接。</p>
      </template>
    </div>
  </section>
  <template v-else>
  <a href="#main-content" class="skip-link" @click.prevent="focusMain">跳到主要内容</a>
  <div class="app-shell">
  <aside class="app-sidebar">
    <a class="brand" :href="'#' + home" aria-label="战略助手首页"><span class="brand-mark"><IconSquaresFilled aria-hidden="true" :size="21" /></span><span>战略助手<small>企业战略落地</small></span></a>
    <nav class="navigation" aria-label="应用导航">
      <a v-for="item in nav" :key="item.path" :href="'#' + item.path" :aria-current="activeNav === item.path ? 'page' : undefined">
        <component :is="item.icon" :size="19" aria-hidden="true" /><span>{{ item.label }}</span>
        <span v-if="item.count" class="nav-count" :aria-label="item.count + ' 个待审批'">{{ item.count }}</span>
      </a>
    </nav>
    <div class="sidebar-scope"><IconFolder :size="18" aria-hidden="true" /><span>设备产品线<small>{{ goals[0].year }} 年度</small></span></div>
  </aside>

  <div class="app-main">
  <header class="app-topbar">
    <nav v-if="['project', 'new'].includes(route.section) && currentNav" class="breadcrumbs" aria-label="面包屑">
      <a :href="'#' + currentNav.path">{{ currentNav.label }}</a><IconChevronRight :size="15" aria-hidden="true" />
      <span aria-current="page">{{ route.section === 'new' ? '新建项目' : project?.name || '项目详情' }}</span>
    </nav>
    <span v-else class="top-context">设备产品线</span>
      <div ref="navPanel" class="top-actions">
        <span v-if="syncLabel" class="sync-chip" :data-state="syncState" role="status">{{ syncLabel }}</span>
        <div class="account">
        <button ref="demoButton" type="button" class="account-button demo-trigger" :aria-expanded="menuOpen === 'demo'" aria-controls="demo-panel" @click="toggleMenu('demo')">
          <IconAdjustments :size="18" aria-hidden="true" />演示设置
        </button>
        <div v-if="menuOpen === 'demo'" id="demo-panel" class="account-menu">
          <p class="menu-label">演示场景</p>
          <button type="button" :aria-pressed="data.scenario === 'flow'" @click="changeScenario('flow')">
            从申报开始<IconCheck v-if="data.scenario === 'flow'" :size="16" aria-hidden="true" />
          </button>
          <button type="button" :aria-pressed="data.scenario === 'review'" @click="changeScenario('review')">
            补件评审示例<IconCheck v-if="data.scenario === 'review'" :size="16" aria-hidden="true" />
          </button>
          <button type="button" class="menu-divider" :aria-pressed="active.simulateAiFailure" @click="failureSwitch">
            下次 AI 调用模拟失败<IconCheck v-if="active.simulateAiFailure" :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="account">
      <button ref="roleButton" type="button" class="account-button role-trigger" :aria-expanded="menuOpen === 'role'" aria-controls="role-panel" @click="toggleMenu('role')">
        <span class="role-avatar" aria-hidden="true">{{ role.name[0] }}</span>{{ role.label }}<IconChevronDown :size="16" aria-hidden="true" />
      </button>
      <div v-if="menuOpen === 'role'" id="role-panel" class="account-menu">
        <p class="menu-label">切换角色</p>
        <button v-for="(item, key) in roles" :key="key" type="button" :aria-pressed="data.role === key" @click="changeRole(key)">
          <span>{{ item.label }}</span><span class="muted">{{ item.name }}</span><IconCheck v-if="data.role === key" :size="16" aria-hidden="true" />
        </button>
      </div>
      </div>
    </div>
  </header>

  <main id="main-content" tabindex="-1">
    <p v-if="syncState === 'error'" class="storage-note" role="alert">
      云端保存失败：{{ syncMessage }}<button class="text-button" type="button" @click="demo.retrySync()">重试保存</button>
    </p>
    <p v-else-if="syncState === 'conflict'" class="storage-note" role="status">{{ syncMessage }}</p>
    <WorkbenchView v-if="route.section === 'workspace'" :role="data.role" :projects="readable" :activity="activity" />

    <ProjectForm v-else-if="(route.section === 'new' && data.role === 'owner') || (detailVisible && route.tab === 'edit' && editable)"
      :key="data.scenario + ':' + (project?.id || 'new')" :project="project" :api="api" @notify="notify" @navigate="navigate" />

    <section v-else-if="route.section === 'dashboard'" class="page-wrap stack">
      <header class="page-heading">
        <div><h1>战略看板</h1><p>查看年度目标进度，追溯项目与确认收入。</p></div>
        <label class="year-filter"><span class="sr-only">年度</span><select><option>{{ goal.year }} 年度</option></select></label>
      </header>
      <section class="surface goal-panel">
        <div class="section-head">
          <div class="heading-with-icon"><IconTarget :size="23" /><h2>{{ goal.name }}</h2></div>
          <button v-if="data.role === 'manager'" class="text-button" type="button" @click="metricHelp = true">计算口径</button>
        </div>
        <div class="summary-metrics" :class="{ three: data.role === 'manager' }">
          <div><span>年度目标</span><strong>{{ money(goal.amount) }}</strong></div>
          <div><span>{{ data.role === 'manager' ? '确认收入汇总' : '当前可见项目确认收入' }}</span><strong>{{ money(totals.income) }}</strong></div>
          <div v-if="data.role === 'manager'"><span>年度目标达成率</span><strong class="brand-ink">{{ percentage(totals.income, goal.amount) }}</strong></div>
        </div>
        <progress v-if="data.role === 'manager'" class="goal-progress" :max="goal.amount" :value="Math.min(totals.income, goal.amount)" aria-label="年度目标进度"></progress>
        <details class="goal-guidance"><summary>查看年度投资要求</summary><p>{{ goal.guidance }}</p></details>
      </section>
      <section class="surface section-panel">
        <div class="section-head"><h2>项目贡献明细</h2><span class="muted">{{ goalProjects.length }} 个项目</span></div>
        <div v-if="goalProjects.length" class="table-scroll">
          <table>
            <thead><tr><th>项目</th><th>状态</th><th>承诺收入</th><th>确认收入</th><th>项目达成率</th><th>年度目标贡献</th></tr></thead>
            <tbody>
              <tr v-for="item in goalProjects" :key="item.id">
                <th scope="row"><a class="row-link" :href="'#' + detailsPath(item.id, defaultTab(item))">{{ item.name }}<IconArrowUpRight :size="16" aria-hidden="true" /></a></th>
                <td><span class="status" :data-status="item.status">{{ projectStates[item.status] }}</span></td>
                <td>{{ money(item.commitment) }}</td>
                <td><a v-if="item.closing" class="row-link" :href="'#' + detailsPath(item.id, 'close')">{{ money(item.closing.amount) }}</a><span v-else class="muted">待结项</span></td>
                <td>{{ item.closing ? percentage(item.closing.amount, item.commitment) : '—' }}</td>
                <td><a v-if="item.closing" class="row-link" :href="'#' + detailsPath(item.id, 'close')">{{ percentage(item.closing.amount, goal.amount) }}</a><span v-else>—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><IconTarget :size="29" /><h3>暂无可见的已立项项目</h3><p>项目通过审批后显示在目标下，结项后计入确认收入。</p></div>
      </section>
      <section id="dashboard-risks" class="surface section-panel" tabindex="-1">
        <div class="section-head"><h2>未关闭预警</h2><span class="muted">{{ totals.openAlerts.length }} 条</span></div>
        <p v-if="!totals.openAlerts.length" class="empty-inline muted">当前没有未关闭的预警。</p>
        <a v-for="{ project: item, alert } in totals.openAlerts" :key="alert.id" class="risk-row" :href="'#' + detailsPath(item.id, 'progress') + '?alert=' + alert.id">
          <IconAlertTriangle :size="20" /><strong>{{ item.name }} · {{ item.milestones.find(m => m.id === alert.milestoneId).name }}</strong>
          <span>延期 {{ alert.delay }} 天 · {{ alertStates[alert.state] }}</span><IconChevronRight :size="18" />
        </a>
      </section>
    </section>

    <section v-else-if="route.section === 'projects'" class="page-wrap stack">
      <header class="page-heading">
        <div><h1>项目台账</h1><p>查找项目、关联目标和当前进度。</p></div>
        <a v-if="data.role === 'owner'" href="#/new" class="button primary"><IconPlus :size="20" />新建项目</a>
      </header>
      <section class="surface section-panel">
        <div class="section-head">
          <h2>{{ data.role === 'owner' ? '我的项目' : '可见项目' }}</h2>
          <div class="table-controls">
            <label class="search-field"><span class="sr-only">搜索项目</span><IconSearch :size="17" aria-hidden="true" /><input v-model="projectQuery" type="search" placeholder="搜索项目" /></label>
            <label class="select-inline"><span class="sr-only">项目状态</span><select v-model="filter"><option value="">全部状态</option>
              <option v-for="(label, key) in projectStates" :key="key" :value="key">{{ label }}</option>
            </select></label>
          </div>
        </div>
        <div v-if="listProjects.length" class="table-scroll">
          <table>
            <thead><tr><th>项目</th><th>关联目标</th><th>承诺收入</th><th>状态</th><th>待跟进预警</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="item in listProjects" :key="item.id">
                <th scope="row"><a class="row-link" :href="'#' + detailsPath(item.id, defaultTab(item))">{{ item.name }}</a></th>
                <td><a class="text-button" href="#/dashboard">{{ goalFor(item.goalId).name }}</a></td>
                <td>{{ money(item.commitment) }}</td>
                <td><span class="status" :data-status="item.status">{{ projectStates[item.status] }}</span></td>
                <td>{{ item.alerts.filter(alert => alert.state !== 'closed').length }}</td>
                <td>
                  <a v-if="canEdit(item, data.role)" class="text-button" :href="'#' + detailsPath(item.id, 'edit')">{{ item.status === 'returned' ? '补充材料' : '编辑申请' }}</a>
                  <a v-else class="text-button" :href="'#' + detailsPath(item.id, defaultTab(item))">查看项目<IconChevronRight :size="16" /></a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><IconFolderOpen :size="28" aria-hidden="true" /><h3>{{ filter || projectQuery ? '没有匹配的项目' : '暂无可见项目' }}</h3>
          <button v-if="filter || projectQuery" class="button secondary small" type="button" @click="filter = ''; projectQuery = ''">清除筛选</button></div>
      </section>
    </section>

    <section v-else-if="route.section === 'approvals' && data.role === 'approver'" class="page-wrap stack">
      <header class="page-heading"><div><h1>审批中心</h1><p>处理待审申请，按提交版本追溯历史决定。</p></div></header>
      <section class="surface section-panel">
        <div class="list-toolbar">
          <nav class="tabs" aria-label="审批列表">
            <a href="#/approvals" :aria-current="approvalMode === 'pending' ? 'page' : undefined">待审批 <span class="list-count">{{ pending.length }}</span></a>
            <a href="#/approvals/history" :aria-current="approvalMode === 'history' ? 'page' : undefined">已处理 <span class="list-count">{{ decisions.length }}</span></a>
          </nav>
          <div class="table-controls">
            <label v-if="approvalMode === 'pending'" class="select-inline"><span class="sr-only">核查状态</span>
              <select :value="checkedOnly ? 'checked' : 'all'" @change="navigate($event.target.value === 'checked' ? '/approvals/checked' : '/approvals')">
                <option value="all">全部核查状态</option><option value="checked">仅已完成核查</option>
              </select>
            </label>
            <label class="search-field"><span class="sr-only">搜索审批项目</span><IconSearch :size="17" aria-hidden="true" /><input v-model="approvalQuery" type="search" placeholder="搜索审批项目" /></label>
          </div>
        </div>
        <div v-if="approvalList.length" class="table-scroll">
          <table>
            <thead><tr><th>项目</th><th>提交版本</th><th>{{ approvalMode === 'pending' ? '提交时间' : '处理时间' }}</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="entry in approvalList" :key="entry.item.id + ':' + entry.number">
                <th scope="row">{{ entry.item.name }}</th><td>v{{ entry.number }}</td><td>{{ dateTime(entry.at) }}</td>
                <td><span class="status" :data-status="entry.state">{{ entry.label }}</span></td>
                <td><a class="text-button" :href="'#' + detailsPath(entry.item.id, 'review') + '?v=' + entry.number">{{ approvalMode === 'pending' ? '开始评审' : '查看审批记录' }}<IconChevronRight :size="16" aria-hidden="true" /></a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty-state"><IconClipboardList :size="28" aria-hidden="true" /><h3>{{ approvalQuery || checkedOnly ? '没有匹配的审批项目' : approvalMode === 'pending' ? '暂无待审批项目' : '暂无审批记录' }}</h3>
          <button v-if="approvalQuery || checkedOnly" type="button" class="button secondary small" @click="approvalQuery = ''; if (checkedOnly) navigate('/approvals')">清除筛选</button>
        </div>
      </section>
    </section>

    <section v-else-if="detailVisible" class="page-wrap">
      <header class="page-heading project-heading">
        <div>
          <div class="heading-with-icon"><h1>{{ project.name }}</h1><span class="status" :data-status="project.status">{{ projectStates[project.status] }}</span></div>
          <p><a class="text-button" href="#/dashboard">{{ goal.year }} 年度 · {{ goal.name }}</a><span class="meta-separator" aria-hidden="true">·</span>承诺收入 {{ money(project.commitment) }}</p>
        </div>
        <a v-if="editable" class="button primary" :href="'#' + detailsPath(project.id, 'edit')">{{ project.status === 'returned' ? '补充材料' : '编辑申请' }}</a>
      </header>
      <nav class="tabs page-tabs" aria-label="项目详情">
        <a v-for="[tab, title] in projectTabs" :key="tab" :href="'#' + detailsPath(project.id, tab)"
          :aria-current="route.tab === tab ? 'page' : undefined">{{ title }}</a>
      </nav>
      <ReviewView v-if="reviewVisible" :key="data.scenario + ':' + project.id" :project="project" :role="data.role"
        :version-hint="route.version" :api="api" @notify="notify" @navigate="navigate" />
      <ExecutionView v-else-if="approved && ['progress', 'close'].includes(route.tab)" :key="data.scenario + ':' + project.id"
        :project="project" :role="data.role" :tab="route.tab" :api="api" @notify="notify" />
      <section v-else class="surface section-panel">
        <div class="section-head"><h2>项目概况</h2><a v-if="project.versions.length" class="text-button" :href="'#' + detailsPath(project.id, 'review')">查看申报与评审<IconChevronRight :size="16" /></a></div>
        <dl class="description-list">
          <dt>项目负责人</dt><dd>{{ roles.owner.name }}</dd><dt>项目类别</dt><dd>{{ project.category }}</dd>
          <dt>起始日期</dt><dd>{{ project.startDate }}</dd><dt>客户需求</dt><dd>{{ project.description || '待填写' }}</dd>
          <template v-if="project.versions.length"><dt>最新提交</dt><dd>v{{ currentVersion(project).number }} · {{ aiStates[currentVersion(project).ai.status] }}</dd></template>
        </dl>
        <div v-if="project.status === 'returned'" class="inline-alert return-note"><strong>退回原因</strong><p>{{ project.reviews.at(-1).reason }}</p></div>
      </section>
    </section>

    <section v-else class="page-wrap">
      <div class="surface empty-state unavailable"><IconFolderOpen :size="31" /><h1>当前页面不可用</h1>
        <p>请检查项目是否存在，或切换到具备查看权限的演示角色。</p><a class="button primary" :href="'#' + home">返回工作台</a>
      </div>
    </section>
  </main>
  </div>
  </div>

  <Modal v-if="metricHelp" title="年度目标达成率" @close="metricHelp = false">
    <div class="modal-text">
      <p>汇总同年度、关联本目标的各项目已结项确认收入，每个项目只计入一次。</p>
      <strong>{{ money(totals.income) }} ÷ {{ money(goal.amount) }} = {{ percentage(totals.income, goal.amount) }}</strong>
    </div>
  </Modal>
  <div v-if="toast" class="toast" :data-error="toast.error" role="status">
    <IconAlertTriangle v-if="toast.error" :size="19" /><IconCheck v-else :size="19" />{{ toast.message }}
  </div>
  </template>
</template>
