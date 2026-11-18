<template>
  <div v-loading="loading" class="mrl">
    <el-empty v-if="!rows.length" :description="emptyText" />

    <article
      v-for="(row, index) in rows"
      :key="keyOf(row, index)"
      class="mrl__card"
      @click="emit('row-click', row)"
    >
      <header class="mrl__head">
        <slot name="card-header" :row="row">
          <span class="mrl__primary">{{ primaryText(row) }}</span>
        </slot>
        <slot name="card-status" :row="row" />
      </header>

      <div v-if="fieldColumns.length" class="mrl__fields">
        <div v-for="col in fieldColumns" :key="col.prop" class="mrl__field">
          <span class="mrl__label">{{ col.label }}</span>
          <el-tag
            v-if="col.type === 'tag'"
            :type="tagTypeOf(row, col)"
            size="small"
            effect="light"
            class="mrl__value"
          >{{ display(row, col) }}</el-tag>
          <span v-else class="mrl__value" :class="{ 'is-num': col.type === 'num' }">{{ display(row, col) }}</span>
        </div>
      </div>

      <slot name="card-extra" :row="row" />

      <footer v-if="$slots['row-actions']" class="mrl__actions" @click.stop>
        <slot name="row-actions" :row="row" />
      </footer>
    </article>
  </div>
</template>

<script setup>
/**
 * 手机端通用卡片列表：与桌面 el-table 互斥渲染，复用同一份分页后数据。
 * 列配置 schema：{ prop, label, primary?, formatter?, value?(row), type?: 'tag'|'num',
 *                 tagType?(row), hideOnMobile? }
 * 插槽：card-header / card-status / card-extra / row-actions，均带 { row }。
 */
import { computed } from 'vue'

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  emptyText: { type: String, default: '暂无数据' },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['row-click'])

const usableColumns = computed(() => props.columns.filter(c => c && c.prop && !c.hideOnMobile))
const primaryColumn = computed(() => usableColumns.value.find(c => c.primary))
const fieldColumns = computed(() => usableColumns.value.filter(c => !c.primary))

function keyOf(row, index) {
  return row?.[props.rowKey] ?? index
}

function valueOf(row, col) {
  if (typeof col.value === 'function') return col.value(row)
  return row?.[col.prop]
}

function format(row, col) {
  const raw = valueOf(row, col)
  if (typeof col.formatter === 'function') return col.formatter(row, raw)
  return raw
}

function display(row, col) {
  const value = format(row, col)
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function primaryText(row) {
  const col = primaryColumn.value
  if (!col) return ''
  return display(row, col)
}

function tagTypeOf(row, col) {
  return typeof col.tagType === 'function' ? col.tagType(row) : (col.tagType || 'info')
}
</script>

<style scoped>
.mrl {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.mrl__card {
  padding: var(--sp-3);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  background: var(--bg-card);
  box-shadow: var(--shadow);
  transition: border-color .12s ease, box-shadow .12s ease;
}

.mrl__card:active { border-color: var(--c-primary); box-shadow: none; }

.mrl__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
  min-width: 0;
}

.mrl__primary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: var(--t-main);
}

.mrl__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px var(--sp-3);
}

.mrl__field { min-width: 0; }

.mrl__label {
  display: block;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--t-weak);
}

.mrl__value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--t-main);
}

.mrl__value.is-num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }

.mrl__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
  padding-top: var(--sp-2);
  border-top: 1px solid var(--bd-split);
}

.mrl__actions :deep(.el-button) {
  flex: 1 1 auto;
  min-height: var(--touch-min);
  margin: 0;
}
</style>
