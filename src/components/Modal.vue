<script setup>
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { IconX } from '@tabler/icons-vue'

defineProps({ title: { type: String, required: true }, side: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const titleId = useId()
onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="modal" :class="{ 'side-dialog': side }" :aria-labelledby="titleId" @cancel.prevent="emit('close')">
    <div class="modal-head">
      <h2 :id="titleId">{{ title }}</h2>
      <button type="button" class="button icon-button" aria-label="关闭弹窗" @click="emit('close')"><IconX :size="20" /></button>
    </div>
    <slot />
  </dialog>
</template>
