import DefaultTheme from 'vitepress/theme'
import './custom.css'
import TovPlayground from './components/TovPlayground.vue'
import TryInPlayground from './components/TryInPlayground.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('TovPlayground', TovPlayground)
    app.component('TryInPlayground', TryInPlayground)
  }
}
