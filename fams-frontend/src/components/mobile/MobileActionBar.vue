<template>
  <div class="mobile-action-bar" role="group" :aria-label="ariaLabel">
    <slot>
      <button
        type="button"
        class="mobile-action-bar__btn is-primary"
        :disabled="disabled"
        @click="emit('primary')"
      >{{ primaryText }}</button>
      <button
        v-if="secondaryText"
        type="button"
        class="mobile-action-bar__btn"
        :disabled="disabled"
        @click="emit('secondary')"
      >{{ secondaryText }}</button>
    </slot>
  </div>
</template>

<script setup>
/**
 * 手机端底部固定主操作条。页面用 v-if="isPhone" 挂载；
 * 底栏高度与安全区留白已由 global.css 的 .main-content padding-bottom 预留。
 */
defineProps({
  primaryText: { type: String, default: '新增' },
  secondaryText: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '页面操作' }
})

const emit = defineEmits(['primary', 'secondary'])
</script>

<style scoped>
.mobile-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-2) calc(var(--sp-3) + var(--safe-right))
           calc(var(--sp-2) + var(--safe-bottom)) calc(var(--sp-3) + var(--safe-left));
  border-top: 1px solid var(--bd);
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(15, 23, 42, .08);
}

/* 组件只在手机分支渲染，这里再做一层兜底，避免误挂到桌面 */
@media (min-width: 768px) {
  .mobile-action-bar { display: none; }
}

.mobile-action-bar__btn {
  flex: 1 1 auto;
  min-height: var(--touch-min);
  padding: 0 var(--sp-3);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  background: var(--bg-card);
  color: var(--t-main);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.mobile-action-bar__btn.is-primary {
  border-color: var(--c-primary);
  background: var(--c-primary);
  color: #fff;
}

.mobile-action-bar__btn:disabled { opacity: .5; cursor: not-allowed; }

.mobile-action-bar :deep(.el-button) {
  flex: 1 1 auto;
  min-height: var(--touch-min);
  margin: 0;
}
</style>
