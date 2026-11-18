<template>
  <el-drawer
    :model-value="modelValue"
    direction="ltr"
    size="86%"
    :with-header="false"
    class="mobile-nav-drawer"
    @update:model-value="onVisible"
    @closed="emit('closed')"
  >
    <div class="mnav">
      <div class="mnav__head">
        <span class="mnav__brand">
          <el-icon><Box /></el-icon>
          <span>固定资产管理</span>
        </span>
        <button type="button" class="mnav__close" aria-label="关闭导航菜单" @click="close">
          <el-icon><Close /></el-icon>
        </button>
      </div>

      <div class="mnav__user">
        <span class="mnav__avatar">{{ initial }}</span>
        <span class="mnav__name">{{ userName || '当前用户' }}</span>
      </div>

      <div v-if="companies.length" class="mnav__section">
        <div class="mnav__label">公司视角</div>
        <el-select
          :model-value="companyView"
          :disabled="scopeDisabled"
          class="mnav__select"
          placeholder="选择公司视角"
          @change="id => emit('company-change', id)"
        >
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <p class="mnav__hint">{{ scopeTip }}</p>
      </div>

      <div v-if="positions.length > 1" class="mnav__section">
        <div class="mnav__label">切换岗位（当前：{{ currentPositionLabel }}）</div>
        <button
          v-for="p in positions"
          :key="p.id"
          type="button"
          class="mnav__position"
          :class="{ 'is-current': p.id === currentPositionId }"
          :disabled="p.id === currentPositionId"
          @click="emit('switch-position', p.id)"
        >
          <span>{{ positionLabel(p) }}</span>
          <span v-if="p.isPrimary" class="mnav__badge">主职</span>
        </button>
      </div>

      <div class="mnav__section mnav__section--menu">
        <div class="mnav__label">功能导航</div>
        <SidebarMenu :collapse="false" @navigate="close" />
      </div>

      <div class="mnav__foot">
        <button type="button" class="mnav__foot-btn" @click="emit('open-help'); close()">
          <el-icon><QuestionFilled /></el-icon><span>使用帮助</span>
        </button>
        <button type="button" class="mnav__foot-btn is-danger" @click="emit('logout'); close()">
          <el-icon><SwitchButton /></el-icon><span>退出登录</span>
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
/**
 * 手机端导航抽屉：菜单 + 公司视角 + 岗位切换 + 帮助 + 退出。
 * 业务逻辑全部保留在 MainLayout，这里只做展示与事件转发，避免出现第二份权限/视角口径。
 */
import { computed } from 'vue'
import SidebarMenu from './SidebarMenu.vue'
import { Box, Close, QuestionFilled, SwitchButton } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  userName: { type: String, default: '' },
  companies: { type: Array, default: () => [] },
  companyView: { type: [String, Number], default: '' },
  scopeDisabled: { type: Boolean, default: false },
  scopeTip: { type: String, default: '' },
  positions: { type: Array, default: () => [] },
  currentPositionId: { type: [String, Number], default: '' },
  currentPositionLabel: { type: String, default: '' }
})

const emit = defineEmits([
  'update:modelValue', 'company-change', 'switch-position', 'open-help', 'logout', 'closed'
])

const initial = computed(() => (props.userName || '管').charAt(0))

function positionLabel(p) {
  return [p.companyName, p.deptName, p.position].filter(Boolean).join(' / ') || '未命名岗位'
}

function onVisible(value) {
  emit('update:modelValue', value)
}

function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.mnav {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--bg-card);
}

.mnav__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(12px + var(--safe-top)) 14px 12px;
  background: var(--c-primary-dark);
  color: #fff;
}

.mnav__brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.mnav__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-min);
  height: var(--touch-min);
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}

.mnav__user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--bd-split);
}

.mnav__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-weight: 600;
}

.mnav__name { font-size: 15px; font-weight: 600; color: var(--t-main); }

.mnav__section {
  padding: 12px 14px;
  border-bottom: 1px solid var(--bd-split);
}

.mnav__section--menu { padding: 12px 0 0; }

.mnav__label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--t-weak);
}

.mnav__section--menu .mnav__label { padding: 0 14px; }

.mnav__select { width: 100%; }

.mnav__hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--t-weak);
}

.mnav__position {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: var(--touch-min);
  margin-bottom: 6px;
  padding: 8px 10px;
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  background: var(--bg-card);
  color: var(--t-main);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.mnav__position.is-current { border-color: var(--c-primary-light); background: var(--c-primary-light); color: var(--c-primary-dark); cursor: default; }
.mnav__position:disabled { opacity: 1; }
.mnav__badge { flex: 0 0 auto; font-size: 11px; color: var(--t-weak); }

.mnav__foot {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding: 12px 14px calc(12px + var(--safe-bottom));
}

.mnav__foot-btn {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--touch-min);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  background: var(--bg-card);
  color: var(--t-sub);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mnav__foot-btn.is-danger { color: var(--c-danger); border-color: var(--c-danger); }

:deep(.sidebar-menu) { border-right: 0; }
:deep(.el-drawer__body) { padding: 0; overflow-y: auto; }
</style>
