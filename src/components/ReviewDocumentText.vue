<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ body: String, quote: String })
const paragraph = ref(null)
const excerpt = ref(null)
const parts = computed(() => {
  const text = props.body || ''
  const index = props.quote ? text.indexOf(props.quote) : -1
  return index < 0 ? [text] : [text.slice(0, index), props.quote, text.slice(index + props.quote.length)]
})

defineExpose({ focus() {
  const target = excerpt.value || paragraph.value
  target?.scrollIntoView({ block: 'nearest' })
  target?.focus({ preventScroll: true })
} })
</script>

<template>
  <p ref="paragraph" class="review-source-text" :class="{ muted: !body }" tabindex="-1">{{ body ? parts[0] : '未提交' }}<mark v-if="parts.length > 1" ref="excerpt" class="evidence-line" tabindex="-1">{{ parts[1] }}</mark>{{ parts[2] }}</p>
</template>
