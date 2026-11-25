<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { IconArrowUpRight, IconChartBar } from '@tabler/icons-vue'
import ConversationComposer from './ConversationComposer.vue'

const props = defineProps({ scope: String, overview: Object, messages: Array, suggestions: Array })
const emit = defineEmits(['question', 'source'])
const input = ref('')
const log = ref(null)
const composer = ref(null)

function send(value = input.value) {
  const question = value.trim()
  if (!question) return
  input.value = ''
  emit('question', question)
}

function sendSuggestion(prompt) {
  send(prompt)
  nextTick(() => composer.value?.focus({ preventScroll: true }))
}

async function scrollLatest() {
  if (!props.messages.length) return
  await nextTick()
  if (log.value) log.value.scrollTop = log.value.scrollHeight
}
onMounted(scrollLatest)
watch(() => props.messages.length, scrollLatest)
</script>

<template>
  <section class="metric-chat" aria-label="问数助手">
    <p class="metric-chat-context">{{ scope }}</p>
    <div ref="log" class="chat-scroll" role="log" aria-label="问数对话" aria-live="polite">
      <div class="chat-transcript chat-width">
        <article v-for="(message, index) in [overview, ...messages]" :key="index" class="chat-turn" :data-role="message.role">
          <div v-if="message.role === 'assistant'" class="chat-assistant-mark"><IconChartBar :size="17" aria-hidden="true" /></div>
          <div class="chat-turn-body">
            <span class="sr-only">{{ message.role === 'user' ? '你：' : '问数助手：' }}</span>
            <p>{{ message.text }}</p>
            <div v-if="message.sources?.length" class="chat-sources">
              <a v-for="source in message.sources" :key="source.href" :href="source.href" @click="emit('source')">
                {{ source.label }}<IconArrowUpRight :size="14" aria-hidden="true" />
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
    <div class="chat-compose-area chat-width">
      <div v-if="!messages.length" class="chat-starters metric-chat-starters" aria-label="常用问数问题">
        <button v-for="prompt in suggestions" :key="prompt" type="button" @click="sendSuggestion(prompt)">{{ prompt }}</button>
      </div>
      <ConversationComposer ref="composer" v-model="input" label="向问数助手提问" placeholder="询问目标进度、项目贡献或预警" :max-length="1000" @send="send()" />
    </div>
  </section>
</template>
