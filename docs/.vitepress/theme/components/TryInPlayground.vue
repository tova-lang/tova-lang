<script setup>
import { computed } from 'vue'
import LZString from 'lz-string'

const props = defineProps({
  code: { type: String, required: true },
  label: { type: String, default: '' }
})

const playgroundUrl = computed(() => {
  const compressed = LZString.compressToEncodedURIComponent(props.code.trim())
  return `/playground-app/index.html#code=${compressed}`
})

const displayLabel = computed(() => {
  return props.label ? `Try "${props.label}" in Playground` : 'Try in Playground'
})
</script>

<template>
  <a
    :href="playgroundUrl"
    target="_blank"
    rel="noopener"
    class="try-in-playground"
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    {{ displayLabel }}
  </a>
</template>

<style scoped>
.try-in-playground {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 16px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 6px;
  background: var(--vp-c-brand-soft);
  text-decoration: none;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
  cursor: pointer;
}

.try-in-playground:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #fff;
}

.try-in-playground svg {
  flex-shrink: 0;
}
</style>
