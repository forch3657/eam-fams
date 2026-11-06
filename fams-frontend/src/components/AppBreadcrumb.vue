<template>
  <nav class="app-breadcrumb" aria-label="面包屑导航">
    <el-breadcrumb separator="/">
      <el-breadcrumb-item :to="{ path: '/workbench' }">首页</el-breadcrumb-item>
      <el-breadcrumb-item
        v-for="(crumb, index) in crumbs"
        :key="`${crumb}-${index}`"
        :aria-current="index === crumbs.length - 1 ? 'page' : undefined"
      >
        {{ crumb }}
      </el-breadcrumb-item>
    </el-breadcrumb>
  </nav>
</template>

<script setup>
/**
 * 轻量面包屑（P1 导航逻辑）
 * 标题直接取 router meta.title —— 路由表是菜单/权限/标题的单一真源，
 * 不再维护第二份「路径 → 标题」映射。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const crumbs = computed(() => route.matched
  .map(record => record.meta?.title)
  .filter(Boolean))
</script>

<style scoped>
.app-breadcrumb {
  margin-bottom: var(--sp-3);
  line-height: 1.5;
}
:deep(.el-breadcrumb) {
  font-size: 13px;
  line-height: 1.5;
}
:deep(.el-breadcrumb__inner) {
  color: var(--t-weak);
  font-weight: 400;
}
:deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--t-main);
  font-weight: 600;
}
</style>
