<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({
  code: { type: String, default: '' },
  embed: { type: Boolean, default: false }
})

const { isDark } = useData()
const iframeRef = ref(null)

const theme = computed(() => isDark.value ? 'dark' : 'light')

// Build src once on mount — never re-trigger iframe reload on theme change
const iframeSrc = ref('')

onMounted(async () => {
  const params = new URLSearchParams({ theme: theme.value })
  if (props.embed) params.set('embed', 'true')
  let src = `/playground-app/index.html?${params}`
  if (props.code) {
    const LZString = (await import('lz-string')).default
    const compressed = LZString.compressToEncodedURIComponent(props.code.trim())
    src += `#code=${compressed}`
  }
  iframeSrc.value = src
})

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
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :src="iframeSrc"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      allow="clipboard-write"
      frameborder="0"
    />
  </div>
</template>

<style scoped>
.tov-playground-wrapper {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
}

.tov-playground-wrapper iframe {
  flex: 1;
  width: 100%;
  border: none;
  display: block;
}
</style>
