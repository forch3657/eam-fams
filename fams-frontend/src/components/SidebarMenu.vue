<template>
  <el-menu
    :default-active="activeMenu"
    :collapse="collapse"
    router
    class="sidebar-menu"
    @select="onSelect"
  >
    <el-menu-item v-if="can('wm:view')" index="/workbench">
      <el-icon><HomeFilled /></el-icon>
      <span>工作台</span>
    </el-menu-item>

    <el-sub-menu v-if="groupVisible(['fa:view', 'fa:report', 'fa:settings'])" index="fixed-asset-group">
      <template #title><el-icon><Monitor /></el-icon><span>固定资产</span></template>
      <el-menu-item v-if="can('fa:view')" index="/fixed-assets"><el-icon><Notebook /></el-icon><span>资产管理</span></el-menu-item>
      <el-menu-item v-if="can('fa:report')" index="/fixed-asset-reports"><el-icon><DataAnalysis /></el-icon><span>资产报表</span></el-menu-item>
      <el-menu-item v-if="can('fa:settings')" index="/fixed-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
    </el-sub-menu>

    <el-sub-menu v-if="groupVisible(['lv:view', 'lv:report', 'lv:settings'])" index="low-value-asset-group">
      <template #title><el-icon><Box /></el-icon><span>低值资产</span></template>
      <el-menu-item v-if="can('lv:view')" index="/low-value-assets"><el-icon><Goods /></el-icon><span>资产管理</span></el-menu-item>
      <el-menu-item v-if="can('lv:report')" index="/low-value-asset-reports"><el-icon><Histogram /></el-icon><span>资产报表</span></el-menu-item>
      <el-menu-item v-if="can('lv:settings')" index="/low-value-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
    </el-sub-menu>

    <el-sub-menu v-if="groupVisible(['org:company', 'org:dept', 'org:user', 'org:role'])" index="org-group">
      <template #title><el-icon><User /></el-icon><span>组织架构</span></template>
      <el-menu-item v-if="can('org:company')" index="/system/company"><el-icon><OfficeBuilding /></el-icon><span>公司管理</span></el-menu-item>
      <el-menu-item v-if="can('org:dept')" index="/system/dept"><el-icon><Connection /></el-icon><span>部门管理</span></el-menu-item>
      <el-menu-item v-if="can('org:user')" index="/system/user"><el-icon><UserFilled /></el-icon><span>用户管理</span></el-menu-item>
      <el-menu-item v-if="can('org:role')" index="/system/role"><el-icon><Avatar /></el-icon><span>角色管理</span></el-menu-item>
    </el-sub-menu>

    <el-sub-menu v-if="groupVisible(['sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message', 'sys:template', 'sys:terminal', 'sys:import'])" index="system-group">
      <template #title><el-icon><Setting /></el-icon><span>系统管理</span></template>
      <el-menu-item v-if="can('sys:dict')" index="/system/dict"><el-icon><Collection /></el-icon><span>数据字典</span></el-menu-item>
      <el-menu-item v-if="can('sys:log')" index="/system/log"><el-icon><Document /></el-icon><span>操作日志</span></el-menu-item>
      <el-menu-item v-if="can('sys:workflow')" index="/system/workflow"><el-icon><Share /></el-icon><span>流程配置</span></el-menu-item>
      <el-menu-item v-if="can('sys:params')" index="/system/params"><el-icon><Operation /></el-icon><span>系统参数</span></el-menu-item>
      <el-menu-item v-if="can('sys:message')" index="/system/message-center"><el-icon><ChatDotRound /></el-icon><span>消息中心</span></el-menu-item>
      <el-menu-item v-if="can('sys:template')" index="/system/message-template"><el-icon><Tickets /></el-icon><span>消息模板</span></el-menu-item>
      <el-menu-item v-if="can('sys:terminal')" index="/system/terminal"><el-icon><Cellphone /></el-icon><span>盘点终端</span></el-menu-item>
      <el-menu-item v-if="can('sys:import')" index="/system/data-import"><el-icon><Upload /></el-icon><span>数据导入</span></el-menu-item>
    </el-sub-menu>
  </el-menu>
</template>

<script setup>
/**
 * 桌面侧栏与手机抽屉共用同一份菜单：权限分组与路由 active 只在这里维护。
 * 桌面传入折叠态，抽屉始终展开；菜单被选中时发 navigate 让抽屉自行收起。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '../store/user'
import {
  HomeFilled, Monitor, Notebook, DataAnalysis, SetUp, Box, Goods, Histogram,
  User, OfficeBuilding, Connection, UserFilled, Avatar, Setting, Collection,
  Document, Share, Operation, ChatDotRound, Tickets, Cellphone, Upload
} from '@element-plus/icons-vue'

defineProps({ collapse: { type: Boolean, default: false } })
const emit = defineEmits(['navigate'])

const route = useRoute()
const userStore = useUserStore()
const activeMenu = computed(() => route.path)
const can = code => userStore.can(code)
const groupVisible = perms => perms.some(p => can(p))

function onSelect() {
  emit('navigate')
}
</script>
