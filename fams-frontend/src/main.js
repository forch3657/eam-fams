import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import App from './App.vue'
import router from './router'
import { useUserStore } from './store/user'
import { useMock } from './services'
import { registerAllSeeds } from './services/mock/seed'
import './styles/global.css'

// 演示数据只登记一次；切到真实后端（VITE_USE_MOCK=false）时仍可调用，
// 但不会被读取，业务代码不受影响
if (useMock) registerAllSeeds()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

useUserStore().restore()

app.mount('#app')
