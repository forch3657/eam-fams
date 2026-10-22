<template>
  <div class="login-page">
    <div class="login-brand">
      <div class="brand-decor">
        <div class="glow g1"></div>
        <div class="glow g2"></div>
        <div class="iso-cube c1"></div>
        <div class="iso-cube c2"></div>
        <div class="iso-cube c3"></div>
      </div>
      <div class="brand-top">
        <div class="brand-logo">
          <el-icon :size="26" color="#fff"><Monitor /></el-icon>
        </div>
        <div>
          <div class="brand-title">固定资产管理系统</div>
          <div class="brand-sub">Fixed Asset Management System</div>
        </div>
      </div>
      <div class="brand-mid">
        <div class="brand-big">资产全生命周期 · 一张账 · 一屏览</div>
        <div class="brand-points">
          <span>资产台账与卡片管理</span>
          <span>入库派发与借出归还</span>
          <span>盘点清查与折旧计提</span>
        </div>
      </div>
      <div class="brand-foot">FAMS · 固定资产管理平台</div>
    </div>

    <div class="login-right">
      <div class="login-card">
        <div class="login-header">
          <h1>欢迎登录</h1>
          <p>固定资产管理系统 · 请使用分配的账号登录</p>
        </div>

        <el-form :model="form" class="login-form" @submit.prevent="handleLogin">
          <el-form-item>
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              size="large"
              :prefix-icon="User"
              autocomplete="username"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              autocomplete="current-password"
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="handleLogin">
            登 录
          </el-button>
        </el-form>

        <div class="login-tip">
          演示账号：admin / 123456（系统管理员），asset / 123456（资产管理员）
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Monitor, User, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '../store/user'

const router = useRouter()
const userStore = useUserStore()

const form = ref({ username: 'admin', password: '123456' })
const loading = ref(false)

function handleLogin() {
  // 去掉首尾空格：复制粘贴账号时容易带入不可见空格，导致校验失败
  const username = String(form.value.username || '').trim()
  const password = String(form.value.password || '').trim()
  if (!username || !password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  const ok = userStore.login(username, password)
  loading.value = false
  if (!ok) {
    ElMessage.error('用户名或密码错误')
    return
  }
  ElMessage.success(`欢迎回来，${userStore.user.name}`)
  router.replace('/fixed-assets')
}
</script>

<style scoped>
.login-page {
  display: flex;
  height: 100vh;
  background: #f0f2f5;
}

/* 左：品牌区 */
.login-brand {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 48px 56px;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: linear-gradient(135deg, #0e4da4 0%, #1668dc 55%, #1f86f5 100%);
}

.brand-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.55;
  animation: float 12s ease-in-out infinite;
}

.g1 {
  width: 420px;
  height: 420px;
  top: -120px;
  right: -80px;
  background: rgba(120, 190, 255, 0.55);
}

.g2 {
  width: 360px;
  height: 360px;
  bottom: -140px;
  left: -60px;
  background: rgba(53, 192, 126, 0.35);
  animation-delay: -4s;
}

.iso-cube {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 10px;
  transform: rotate(45deg);
  animation: spin 18s linear infinite;
}

.c1 { width: 120px; height: 120px; top: 22%; left: 12%; }
.c2 { width: 78px; height: 78px; top: 46%; left: 30%; animation-duration: 24s; }
.c3 { width: 160px; height: 160px; bottom: 12%; right: 18%; animation-duration: 30s; }

.brand-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.32);
  backdrop-filter: blur(6px);
}

.brand-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.brand-sub {
  font-size: 12px;
  opacity: 0.75;
  letter-spacing: 1px;
}

.brand-mid {
  position: relative;
  margin-top: auto;
  margin-bottom: auto;
}

.brand-big {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.4;
  max-width: 460px;
}

.brand-points {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brand-points span {
  position: relative;
  padding-left: 18px;
  font-size: 14px;
  opacity: 0.88;
}

.brand-points span::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #35c07e;
}

.brand-foot {
  position: relative;
  font-size: 12px;
  opacity: 0.7;
}

/* 右：表单区 */
.login-right {
  width: 480px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.login-card {
  width: 340px;
}

.login-header h1 {
  font-size: 22px;
  font-weight: 600;
  color: #0f172a;
}

.login-header p {
  margin-top: 8px;
  margin-bottom: 28px;
  font-size: 13px;
  color: #94a3b8;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
  letter-spacing: 4px;
  font-weight: 600;
}

.login-tip {
  margin-top: 22px;
  font-size: 12px;
  line-height: 1.8;
  color: #94a3b8;
  background: #f5f7fa;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}

@keyframes float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, 30px, 0); }
}

@keyframes spin {
  from { transform: rotate(45deg); }
  to { transform: rotate(405deg); }
}

@media (max-width: 1024px) {
  .login-brand { display: none; }
  .login-right { width: 100%; }
}
</style>
