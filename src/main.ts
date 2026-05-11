import 'reflect-metadata'
import App from './App.vue'
import router from './router'
import { windowManager } from './functions/window'

import { createApp } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

import './assets/css/flow.css'
import './assets/css/style.css'
import './assets/css/option.css'
import './assets/css/modal.css'

const app = createApp(App)

library.add(fas)
app.component('FontAwesomeIcon', FontAwesomeIcon)

app.use(router)

// 将 router 实例注入到 windowManager（用于 Web 环境）
windowManager.setRouter(router)

app.mount('#app')

export default app
