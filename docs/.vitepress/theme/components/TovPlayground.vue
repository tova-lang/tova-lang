<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useData, withBase } from 'vitepress'

const props = defineProps({
  code: { type: String, default: '' },
  embed: { type: Boolean, default: false }
})

const { isDark } = useData()
const iframeRef = ref(null)
const loading = ref(true)

const theme = computed(() => isDark.value ? 'dark' : 'light')

// Build src once on mount — never re-trigger iframe reload on theme change
const iframeSrc = ref('')

onMounted(async () => {
  const params = new URLSearchParams({ theme: theme.value })
  if (props.embed) params.set('embed', 'true')
  let src = `${withBase('/playground-app/index.html')}?${params}`
  if (props.code) {
    const LZString = (await import('lz-string')).default
    const compressed = LZString.compressToEncodedURIComponent(props.code.trim())
    src += `#code=${compressed}`
  }
  iframeSrc.value = src
})

function onIframeLoad() {
  loading.value = false
}

// After initial load, sync theme changes via postMessage only
watch(isDark, () => {
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage({
      type: 'tova-playground-theme',
      theme: theme.value
    }, '*')
  }
})
</script>

<template>
  <div class="tov-playground-wrapper">
    <div v-if="loading && iframeSrc" class="tov-playground-loading">
      <svg width="20" height="20" viewBox="0 0 20 20" class="spinner">
        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40 20" />
      </svg>
      Loading playground...
    </div>
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :src="iframeSrc"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      allow="clipboard-write"
      frameborder="0"
      @load="onIframeLoad"
    />
  </div>
</template>

<style scoped>
.tov-playground-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
  width: 100%;
}

.tov-playground-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
}

.tov-playground-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  z-index: 1;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}
</style>
