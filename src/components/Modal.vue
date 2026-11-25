<script setup>
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { IconX } from '@tabler/icons-vue'

const props = defineProps({ title: { type: String, required: true }, side: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const titleId = useId()
let closing = false
onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})

async function closeDialog() {
  if (closing) return
  closing = true
  const element = dialog.value
  if (element.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const compact = window.matchMedia('(max-width: 800px)').matches
    const transform = props.side ? (compact ? 'translateY(24px)' : 'translateX(12px)') : 'translateY(6px) scale(.985)'
    const style = getComputedStyle(element)
    const animation = element.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform }], {
      duration: Number.parseFloat(style.getPropertyValue('--motion-page')),
      easing: style.getPropertyValue('--ease-out').trim(),
      fill: 'forwards',
    })
    await animation.finished.catch(() => {})
  }
  if (element.open) {
    element.close()
    emit('close')
  }
}
</script>

<template>
  <dialog ref="dialog" class="modal" :class="{ 'side-dialog': side }" :aria-labelledby="titleId" @cancel.prevent="closeDialog">
    <div class="modal-head">
      <h2 :id="titleId">{{ title }}</h2>
      <button type="button" class="button icon-button" aria-label="关闭弹窗" @click="closeDialog"><IconX :size="20" aria-hidden="true" /></button>
    </div>
    <slot />
  </dialog>
</template>
