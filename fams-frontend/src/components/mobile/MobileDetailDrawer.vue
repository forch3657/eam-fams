<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    size="100%"
    direction="rtl"
    class="mobile-detail-drawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <dl v-if="row" class="mdd">
      <div v-for="col in columns" :key="col.prop" class="mdd__row">
        <dt>{{ col.label }}</dt>
        <dd>
          <el-tag
            v-if="col.type === 'tag'"
            :type="tagTypeOf(row, col)"
            size="small"
            effect="light"
          >{{ display(row, col) }}</el-tag>
          <span v-else :class="{ 'is-num': col.type === 'num' }">{{ display(row, col) }}</span>
        </dd>
      </div>
      <slot :row="row" />
    </dl>
    <el-empty v-else description="暂无详情" />
  </el-drawer>
</template>

<script setup>
/**
 * 手机端通用详情抽屉：卡片只放 4~6 个核心字段，点开后这里展示完整字段。
 * 与 global.css 的 .el-drawer 近全屏规则共用，header 固定、body 独立滚动。
 */
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '详情' },
  columns: { type: Array, default: () => [] },
  row: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

function valueOf(row, col) {
  if (typeof col.value === 'function') return col.value(row)
  return row?.[col.prop]
}

function display(row, col) {
  const raw = valueOf(row, col)
  const value = typeof col.formatter === 'function' ? col.formatter(row, raw) : raw
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function tagTypeOf(row, col) {
  return typeof col.tagType === 'function' ? col.tagType(row) : (col.tagType || 'info')
}
</script>

<style scoped>
.mdd {
  margin: 0;
  padding-bottom: calc(var(--sp-4) + var(--safe-bottom));
}

.mdd__row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: 12px 0;
  border-bottom: 1px solid var(--bd-split);
}

.mdd__row:last-child { border-bottom: 0; }

.mdd dt {
  flex: 0 0 96px;
  margin: 0;
  color: var(--t-weak);
  font-size: 13px;
  line-height: 1.6;
}

.mdd dd {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--t-main);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.mdd dd.is-num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
</style>
