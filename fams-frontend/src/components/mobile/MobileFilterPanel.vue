<template>
  <section class="mfp">
    <button
      type="button"
      class="mfp__toggle"
      :aria-expanded="expanded"
      aria-controls="mfp-body"
      @click="expanded = !expanded"
    >
      <span class="mfp__title">
        <el-icon><Filter /></el-icon>
        {{ title }}
        <span v-if="activeCount" class="mfp__count">{{ activeCount }}</span>
      </span>
      <el-icon class="mfp__arrow" :class="{ 'is-open': expanded }"><ArrowDown /></el-icon>
    </button>

    <div v-show="expanded" id="mfp-body" class="mfp__body">
      <slot />
      <div v-if="$slots.actions" class="mfp__actions">
        <slot name="actions" />
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * 手机端可折叠筛选面板。用 v-show 而非 v-if：展开/收起与横竖屏切换都不销毁表单 DOM，
 * 已输入的条件不会丢失。表单项与按钮均由页面通过插槽复用，避免重复实现查询口径。
 */
import { ref } from 'vue'
import { Filter, ArrowDown } from '@element-plus/icons-vue'

const props = defineProps({
  title: { type: String, default: '筛选条件' },
  activeCount: { type: Number, default: 0 },
  defaultExpanded: { type: Boolean, default: false }
})

const expanded = ref(props.defaultExpanded)
</script>

<style scoped>
.mfp {
  margin-bottom: var(--sp-3);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  background: var(--bg-card);
}

.mfp__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 var(--sp-3);
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--t-main);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.mfp__title { display: inline-flex; align-items: center; gap: 6px; }

.mfp__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--c-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 400;
}

.mfp__arrow { transition: transform .12s ease; }
.mfp__arrow.is-open { transform: rotate(180deg); }

.mfp__body {
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  border-top: 1px solid var(--bd-split);
}

.mfp__body :deep(.el-form-item) { margin-bottom: var(--sp-2); }
.mfp__body :deep(.el-form-item__label) { padding-bottom: 2px; }

.mfp__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}

.mfp__actions :deep(.el-button) {
  flex: 1 1 auto;
  min-height: var(--touch-min);
  margin: 0;
}
</style>
