<script setup>
import { computed } from 'vue'
import { IconBook2, IconChevronRight } from '@tabler/icons-vue'
import { alertStates, dateTime } from '../domain.js'
import { riskLevel } from '../agentPolicy.js'

const props = defineProps({ projects: Array, projectId: String, alerts: Array })
defineEmits(['select-project', 'show-rule'])
const status = defineModel('status', { type: String, required: true })
const records = computed(() => props.alerts.filter(({ project, alert }) =>
  (!props.projectId || project.id === props.projectId) && (!status.value || alert.state === status.value)))
const detailPath = ({ project, alert }) => '#/risks/' + project.id + '?alert=' + encodeURIComponent(alert.id)
</script>

<template>
  <section class="project-collection" aria-labelledby="risk-list-heading">
    <header class="project-list-head">
      <h2 id="risk-list-heading">预警列表</h2>
      <div class="risk-list-controls">
        <label v-if="projects.length > 1 || projectId"><span class="sr-only">筛选项目</span>
          <select :value="projectId" @change="$emit('select-project', $event.target.value)">
            <option value="">所有项目</option><option v-for="item in projects" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label><span class="sr-only">筛选预警状态</span><select v-model="status">
          <option value="">全部状态</option><option v-for="(label, key) in alertStates" :key="key" :value="key">{{ label }}</option>
        </select></label>
        <button class="button secondary" type="button" aria-haspopup="dialog" @click="$emit('show-rule')"><IconBook2 :size="17" aria-hidden="true" />预警规则</button>
      </div>
    </header>
    <ul v-if="records.length" class="project-list">
      <li v-for="entry in records" :key="entry.project.id + ':' + entry.alert.id">
        <a :href="detailPath(entry)" class="risk-list-row">
          <span class="risk-list-name">
            <strong>{{ entry.project.milestones.find(item => item.id === entry.alert.milestoneId)?.name || '里程碑预警' }}</strong>
            <small>{{ entry.project.name }}</small>
          </span>
          <dl class="risk-list-metrics">
            <div><dt>预计延期</dt><dd class="warning-text">{{ entry.alert.delay }} 天</dd></div>
            <div><dt>风险级别</dt><dd>{{ riskLevel(entry.alert.delay) }}</dd></div>
            <div><dt>触发时间</dt><dd>{{ dateTime(entry.alert.createdAt) }}</dd></div>
          </dl>
          <span class="status" :data-status="entry.alert.state">{{ alertStates[entry.alert.state] }}</span>
          <span class="risk-list-link">查看详情<IconChevronRight :size="17" aria-hidden="true" /></span>
        </a>
      </li>
    </ul>
    <div v-else class="empty-state">
      <p>{{ !projects.length ? '暂无可查看的执行项目' : status ? '没有符合当前状态的预警' : '暂无预警记录' }}</p>
      <button v-if="status" class="button secondary" type="button" @click="status = ''">清除状态筛选</button>
      <a v-else :href="projectId ? '#/project/' + projectId + '/progress' : '#/projects'" class="text-button">{{ projectId ? '查看项目进度' : '查看项目档案' }}<IconChevronRight :size="16" aria-hidden="true" /></a>
    </div>
  </section>
</template>
