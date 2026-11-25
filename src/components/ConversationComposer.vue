<script setup>
import { ref, useId } from 'vue'
import { IconArrowUp } from '@tabler/icons-vue'

defineProps({ label: String, placeholder: String, maxLength: { type: Number, default: 5000 } })
const emit = defineEmits(['send'])
const text = defineModel({ type: String, required: true })
const input = ref(null)
const inputId = useId()
defineExpose({ focus: options => input.value?.focus(options) })

function onEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (text.value.trim()) emit('send')
}
</script>

<template>
  <form class="chat-composer" @submit.prevent="emit('send')">
    <label class="sr-only" :for="inputId">{{ label }}</label>
    <textarea :id="inputId" ref="input" v-model="text" rows="2" :maxlength="maxLength" :placeholder="placeholder" @keydown.enter.exact="onEnter" />
    <div class="chat-composer-tools">
      <slot />
      <button class="chat-send" type="submit" aria-label="发送消息" :disabled="!text.trim()"><IconArrowUp :size="22" aria-hidden="true" /></button>
    </div>
  </form>
</template>
