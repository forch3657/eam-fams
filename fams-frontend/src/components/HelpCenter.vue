<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    size="78%"
    :with-header="false"
    class="help-drawer"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="help-shell">
      <header class="help-header">
        <div class="help-heading">
          <el-icon class="help-logo"><QuestionFilled /></el-icon>
          <div>
            <h2>使用帮助中心</h2>
            <p>{{ roleText }} · {{ companyScope.viewName }} · 按角色与场景查找操作指引</p>
          </div>
        </div>
        <el-button link class="help-close" aria-label="关闭帮助" @click="$emit('update:modelValue', false)">
          <el-icon><Close /></el-icon>
        </el-button>
      </header>

      <div class="help-body">
        <aside class="help-nav">
          <el-input v-model="keyword" placeholder="搜索问题、功能或术语" clearable class="help-search">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div class="help-nav-scroll">
            <template v-if="!keyword.trim()">
              <section v-for="group in groups" :key="group.title" class="nav-group">
                <div class="nav-group-title">{{ group.title }}</div>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  type="button"
                  class="nav-item"
                  :class="{ active: activeId === item.id }"
                  @click="activeId = item.id"
                >
                  <span class="nav-item-text">{{ item.title }}</span>
                  <span v-if="isForMe(item)" class="nav-mine" title="适用于你当前角色">我</span>
                </button>
              </section>
            </template>
            <template v-else>
              <div class="nav-search-count">找到 {{ filteredItems.length }} 条相关内容</div>
              <button
                v-for="item in filteredItems"
                :key="item.id"
                type="button"
                class="nav-item"
                :class="{ active: activeId === item.id }"
                @click="activeId = item.id"
              >
                <span class="nav-item-text">{{ item.title }}</span>
                <span class="nav-item-group">{{ item.group }}</span>
              </button>
              <el-empty v-if="!filteredItems.length" description="没有匹配内容，换个词试试" :image-size="60" />
            </template>
          </div>
          <div class="help-nav-foot">内容随系统版本更新 · v1.0</div>
        </aside>

        <main class="help-content" v-if="activeItem">
          <div class="content-head">
            <div class="content-title-line">
              <h3>{{ activeItem.title }}</h3>
              <el-tag v-if="isForMe(activeItem)" type="success" effect="plain" size="small">适用你</el-tag>
              <el-tag v-else type="info" effect="plain" size="small">其他角色</el-tag>
            </div>
            <div class="content-meta">
              <span>{{ activeItem.group }}</span>
              <span v-if="activeItem.roles.length">适用角色：{{ roleNames(activeItem.roles) }}</span>
              <span v-else>适用角色：全体</span>
            </div>
            <p class="content-summary">{{ activeItem.summary }}</p>
          </div>

          <el-divider class="content-divider" />

          <section class="content-section">
            <h4>操作指引</h4>
            <ol class="step-list">
              <li v-for="(step, index) in activeItem.steps" :key="index" class="step-item">
                <span class="step-no">{{ index + 1 }}</span>
                <div>
                  <div class="step-title">{{ step.title }}</div>
                  <div class="step-detail">{{ step.detail }}</div>
                </div>
              </li>
            </ol>
          </section>

          <section v-if="activeItem.tips && activeItem.tips.length" class="content-section">
            <h4>注意事项</h4>
            <el-alert
              v-for="(tip, index) in activeItem.tips"
              :key="index"
              :title="tip"
              type="warning"
              :closable="false"
              show-icon
              class="help-tip"
            />
          </section>

          <section v-if="allowedPages.length" class="content-section">
            <h4>相关页面</h4>
            <div class="page-links">
              <el-button v-for="page in allowedPages" :key="page.path" type="primary" plain @click="goPage(page.path)">
                {{ page.title }}
                <el-icon class="page-arrow"><ArrowRight /></el-icon>
              </el-button>
            </div>
          </section>
        </main>
        <main v-else class="help-content">
          <el-empty description="没有找到相关内容，换个关键词试试" />
        </main>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Close, QuestionFilled, ArrowRight } from '@element-plus/icons-vue'
import { useUserStore } from '../store/user'
import { useCompanyScopeStore } from '../store/companyScope'
import { HELP_GROUPS, ALL_HELP_ITEMS, ROLE_META } from '../data/helpCenter'

defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const userStore = useUserStore()
const companyScope = useCompanyScopeStore()

const groups = HELP_GROUPS
const keyword = ref('')
const activeId = ref('workbench')

const currentRoles = computed(() => userStore.user?.roleIds || [])
const roleText = computed(() => {
  const names = currentRoles.value.map(id => ROLE_META[id]?.name).filter(Boolean)
  return names.length ? names.join('、') : '当前账号'
})

const filteredItems = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return ALL_HELP_ITEMS
  return ALL_HELP_ITEMS.filter(item => {
    const haystack = [
      item.title, item.summary, item.group,
      ...(item.keywords || []),
      ...item.steps.flatMap(step => [step.title, step.detail]),
      ...(item.tips || [])
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

// 搜索结果变化时保证右侧有内容可看；不做自动跳到首条，避免打断用户当前阅读
watch(filteredItems, list => {
  if (keyword.value.trim() && list.length && !list.some(i => i.id === activeId.value)) {
    activeId.value = list[0].id
  }
})

const visibleItems = computed(() => (keyword.value.trim() ? filteredItems.value : ALL_HELP_ITEMS))
const activeItem = computed(() => visibleItems.value.find(i => i.id === activeId.value) || null)

const allowedPages = computed(() => (activeItem.value?.pages || []).filter(page => !page.permission || userStore.can(page.permission)))

function isForMe(item) {
  return !item.roles.length || item.roles.some(role => currentRoles.value.includes(role))
}

function roleNames(roles) {
  return roles.map(id => ROLE_META[id]?.name || id).join('、')
}

function goPage(path) {
  emit('update:modelValue', false)
  if (router.currentRoute.value.path !== path) router.push(path)
}
</script>

<style scoped>
.help-drawer :deep(.el-drawer__body) {
  padding: 0;
}

.help-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--t-bg, #f5f7fa);
}

.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}

.help-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.help-logo {
  font-size: 28px;
  color: var(--el-color-primary);
}

.help-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--t-main, #1f2d3d);
}

.help-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--t-weak, #8492a6);
}

.help-close {
  font-size: 20px;
}

.help-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.help-nav {
  width: 260px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #ebeef5;
}

.help-search {
  padding: 16px;
}

.help-nav-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 12px;
}

.nav-group {
  margin-bottom: 14px;
}

.nav-group-title {
  padding: 8px 10px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--t-weak, #8492a6);
  letter-spacing: 0.5px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 10px;
  margin-bottom: 2px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--t-main, #1f2d3d);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.nav-item:hover {
  background: #f0f6ff;
}

.nav-item.active {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--el-color-primary, #409eff);
  font-weight: 600;
}

.nav-item-text {
  flex: 1;
}

.nav-mine {
  flex: none;
  padding: 0 5px;
  border-radius: 8px;
  background: #f0f9eb;
  color: #67c23a;
  font-size: 11px;
}

.nav-item-group {
  font-size: 11px;
  color: var(--t-weak, #8492a6);
}

.nav-search-count {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--t-weak, #8492a6);
}

.help-nav-foot {
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
  font-size: 11px;
  color: var(--t-weak, #8492a6);
}

.help-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
  background: #fff;
}

.content-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-title-line h3 {
  margin: 0;
  font-size: 20px;
  color: var(--t-main, #1f2d3d);
}

.content-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--t-weak, #8492a6);
}

.content-summary {
  margin: 14px 0 0;
  padding: 14px 16px;
  border-left: 3px solid var(--el-color-primary, #409eff);
  background: #f5f9ff;
  border-radius: 0 6px 6px 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--t-main, #1f2d3d);
}

.content-divider {
  margin: 20px 0;
}

.content-section {
  margin-bottom: 28px;
}

.content-section h4 {
  margin: 0 0 14px;
  font-size: 15px;
  color: var(--t-main, #1f2d3d);
}

.step-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-item {
  display: flex;
  gap: 12px;
  padding-bottom: 18px;
}

.step-no {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary, #409eff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--t-main, #1f2d3d);
}

.step-detail {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--t-sub, #5e6d82);
}

.help-tip {
  margin-bottom: 8px;
}

.page-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.page-arrow {
  margin-left: 4px;
}

/* 900px 属 md/lg 档内的既有微调，按 docs/responsive-adaptation.md §3 归并映射保留 */
@media (max-width: 900px) {
  .help-nav {
    width: 190px;
  }
  .help-content {
    padding: 20px;
  }
}

/* 手机：抽屉本体已由 global.css 限为 100vw，导航改为上下分栏 */
@media (max-width: 767px) {
  .help-body { flex-direction: column; }
  .help-nav {
    width: 100%;
    max-width: 100%;
    max-height: 42%;
    border-right: 0;
    border-bottom: 1px solid #ebeef5;
  }
  .help-content { padding: 12px 14px calc(24px + var(--safe-bottom)); }
}
</style>
