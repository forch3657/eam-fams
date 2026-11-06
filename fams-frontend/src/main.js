import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import App from './App.vue'
import router from './router'
import { useUserStore } from './store/user'
import { useMock } from './services'
import { registerAllSeeds } from './services/mock/seed'
import { installA11y } from './utils/a11y'
import { setErrorNotifier } from './services/http'
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

// 全局可访问性：表单 label 关联、动态弹窗补扫（在挂载前注册 MutationObserver）
installA11y(router)
// 全局错误兜底：权限 / 服务端 / 网络类失败由 http 层统一给可见提示
setErrorNotifier(msg => ElMessage.error(msg))

app.mount('#app')
