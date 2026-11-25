<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { IconArrowUpRight, IconBook2, IconFileText, IconMessageCircle } from '@tabler/icons-vue'
import ConversationComposer from './ConversationComposer.vue'

const props = defineProps({ version: Number, overview: Object, messages: Array, suggestions: Array })
const emit = defineEmits(['question', 'source'])
const input = ref('')
const thread = ref(null)
const composer = ref(null)

async function scrollLatest() {
  if (!props.messages.length) return
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
}
onMounted(scrollLatest)
watch(() => props.messages.length, scrollLatest)

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
</script>

<template>
  <section class="review-assistant" aria-label="AI 评审助手">
    <header class="review-assistant-head">
      <h3><IconMessageCircle :size="19" aria-hidden="true" />AI 评审助手</h3>
      <span class="muted">申报 v{{ version }}</span>
    </header>
    <div ref="thread" class="review-chat-thread chat-scroll" role="log" aria-label="评审对话" aria-live="polite" aria-relevant="additions text">
      <div class="chat-transcript">
        <article v-for="(message, index) in [overview, ...messages]" :key="index" class="chat-turn" :data-role="message.role">
          <div v-if="message.role === 'assistant'" class="chat-assistant-mark"><IconMessageCircle :size="17" aria-hidden="true" /></div>
          <div class="chat-turn-body">
            <span class="sr-only">{{ message.role === 'user' ? '你：' : '评审助手：' }}</span>
            <p>{{ message.text }}</p>
            <div v-if="message.sources?.length" class="chat-sources">
              <button v-for="source in message.sources" :key="source.rule || source.file + ':' + source.quote" type="button" @click="emit('source', source)">
                <component :is="source.file ? IconFileText : IconBook2" :size="14" aria-hidden="true" />{{ source.label }}<IconArrowUpRight :size="13" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
    <div class="review-chat-controls">
      <div v-if="!messages.length" class="chat-starters" aria-label="常用评审问题">
        <button v-for="prompt in suggestions" :key="prompt" type="button" @click="sendSuggestion(prompt)">{{ prompt }}</button>
      </div>
      <ConversationComposer ref="composer" v-model="input" label="向评审助手提问" placeholder="询问当前申报版本的材料、风险或评审依据" :max-length="1000" @send="send()" />
    </div>
  </section>
</template>
