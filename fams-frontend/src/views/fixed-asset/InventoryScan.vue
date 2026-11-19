<template>
  <div class="scan-page">
    <header class="scan-head">
      <button type="button" class="scan-head__btn" @click="goBack">← 返回</button>
      <span class="scan-head__title">扫码盘点</span>
      <button type="button" class="scan-head__btn" @click="goCertGuide">证书设置</button>
      <button type="button" class="scan-head__btn" @click="reloadDocs">刷新</button>
    </header>

    <section class="scan-card">
      <div class="scan-doc-row">
        <label for="scan-doc">盘点单</label>
        <el-select id="scan-doc" v-model="docId" placeholder="选择盘点单" :disabled="scanning" style="width:100%">
          <el-option
            v-for="d in docs"
            :key="d.id"
            :label="`${d.docNo || d.name || d.id}（已盘 ${d.counted}/${d.total}）`"
            :value="d.id"
          />
        </el-select>
      </div>
      <div class="scan-progress">
        <span>已盘 <b>{{ counted }}</b> / {{ total }}</span>
        <el-progress :percentage="percent" :stroke-width="10" :show-text="false" />
      </div>
      <div v-if="!docs.length && !docsLoading" class="scan-empty">
        <p class="scan-hint">
          暂无可盘点的单据：只有「草稿 / 已驳回」且分派给当前账号的盘点单可以扫码登记。
          审批中或已完结的单据明细只读，需先撤销审批或另开新单。
        </p>
        <button type="button" @click="goBack">去盘点单列表新建</button>
      </div>
    </section>

    <section v-if="!secure" class="scan-alert">
      <p>当前页面不是安全上下文，浏览器禁止调用摄像头。要开启扫码请依次完成：</p>
      <ol>
        <li>
          点此进入证书引导页（含下载按钮与安装检测）：
          <a :href="certGuideUrl">前往设置</a>
        </li>
        <li>在系统「设置 → 安全 → 从存储设备安装 → CA 证书」中安装它（iOS 还需到「证书信任设置」打开完全信任）</li>
        <li>
          用 <a :href="httpsScanUrl">{{ httpsScanUrl }}</a> 重新打开本页，地址栏出现锁形图标后即可点「开始盘点」
        </li>
      </ol>
      <p>扫码枪与手动输入不依赖证书，仍可正常使用。</p>
    </section>

    <section v-else class="scan-view">
      <video ref="videoRef" class="scan-video" playsinline muted autoplay></video>
      <div v-if="!scanning && !cameraError" class="scan-view__mask">点「开始盘点」打开摄像头，之后可连续扫码</div>
      <div v-if="cameraError" class="scan-view__err">
        <p>{{ cameraError }}</p>
        <p v-if="cameraErrorCert" class="scan-view__errhint">
          地址栏若显示红色叉号的 https，说明证书还没被信任——这正是摄像头被拒的原因。
          点下面按钮下载并安装证书，装好后会自动回到这里。
        </p>
        <button type="button" class="scan-view__certbtn" @click="goCertGuide">去安装证书 / 重新检测</button>
      </div>
      <div v-if="scanning" class="scan-view__live">● 正在连续识别</div>
    </section>

    <section v-if="lastResult" class="scan-result" :class="`is-${String(lastResult.status || 'error').toLowerCase()}`">
      <div class="scan-result__head">
        <strong>{{ statusText(lastResult.status) }}</strong>
        <span v-if="busy" class="scan-result__busy">提交中…</span>
      </div>
      <div class="scan-result__body">
        <span class="scan-result__code">{{ lastResult.assetNo || '-' }}</span>
        <span v-if="lastResult.assetName">{{ lastResult.assetName }}</span>
        <span v-if="lastResult.result">{{ resultText(lastResult.result) }}</span>
      </div>
      <p class="scan-result__msg">{{ lastResult.message || '' }}</p>
      <div v-if="lastResult.assetNo" class="scan-result__ops">
        <button type="button" @click="openManual(lastResult.assetNo)">登记差异 / 改判</button>
        <button v-if="lastResult.status === 'NOT_IN_SCOPE'" type="button" @click="goBack">到盘点单登记账外资产</button>
      </div>
    </section>

    <section v-if="showManual" class="scan-manual">
      <div class="scan-manual__title">登记差异 / 改判（会覆盖该资产已登记的结果）</div>
      <label>资产编号</label>
      <input v-model="manualForm.assetNo" type="text" placeholder="资产编号" />
      <label>盘点结果</label>
      <el-select v-model="manualForm.result" style="width:100%">
        <el-option v-for="r in RESULT_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
      </el-select>
      <label v-if="manualForm.result === 'ABNORMAL'">处理去向</label>
      <el-select v-if="manualForm.result === 'ABNORMAL'" v-model="manualForm.disposal" style="width:100%">
        <el-option v-for="d in DISPOSAL_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
      </el-select>
      <label>原因 / 备注</label>
      <input v-model="manualForm.remark" type="text" placeholder="盘亏、盘盈、异常必须填写原因" />
      <div class="scan-manual__ops">
        <button type="button" @click="submitManual">提交</button>
        <button type="button" class="is-plain" @click="showManual = false">取消</button>
      </div>
    </section>

    <section class="scan-gun">
      <label for="scan-gun">扫码枪 / 手动输入（回车提交，不跳页可连续扫）</label>
      <input
        id="scan-gun"
        ref="gunInput"
        v-model="gunText"
        type="text"
        autocomplete="off"
        placeholder="扫描或输入资产编号"
        @keyup.enter="submitGun"
      />
    </section>

    <section v-if="recent.length" class="scan-recent">
      <div class="scan-recent__title">最近扫码</div>
      <div v-for="(r, i) in recent" :key="`${r.assetNo}-${i}`" class="scan-recent__row">
        <span>{{ r.assetNo }}</span>
        <span>{{ statusText(r.status) }}</span>
        <span class="scan-recent__time">{{ r.time }}</span>
      </div>
    </section>

    <div class="scan-toolbar">
      <button type="button" class="is-primary" :disabled="!canStart" @click="toggleScan">
        {{ scanning ? '结束盘点' : '开始盘点' }}
      </button>
      <button type="button" @click="goBack">返回盘点单列表</button>
    </div>

    <MobileActionBar
      v-if="isPhone"
      :primary-text="primaryText"
      :secondary-text="'返回列表'"
      :disabled="!canStart"
      @primary="toggleScan"
      @secondary="goBack"
    />
  </div>
</template>

<script setup>
/**
 * 连续扫码盘点（手机全屏页）。
 *
 * 点一次「开始盘点」后摄像头常驻，识别到标签即逐条提交，直到「结束盘点」。
 * 所有写操作走后端 /api/inventory-scan/{docId}/record 的逐条合并 + version 乐观锁，
 * 不整单覆盖，支持多人同时盘一张单。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MobileActionBar from '../../components/mobile/MobileActionBar.vue'
import { useAppStore } from '../../store/app'
import { ContinuousScanner, cameraCapability } from '../../utils/scanCamera'
import { decodeAssetQr, fetchScanDocs, newScanId, recordScan } from '../../services/inventoryScan'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const isPhone = computed(() => appStore.isPhone)
const secure = cameraCapability().secure
const certGuideUrl = `${window.location.protocol}//${window.location.host}/cert-guide${window.location.search}`
const httpsScanUrl = `https://${window.location.host}${window.location.pathname}${window.location.search}`

const RESULT_OPTIONS = [
  { value: 'MATCHED', label: '账实相符' },
  { value: 'SURPLUS', label: '盘盈' },
  { value: 'LOSS', label: '盘亏' },
  { value: 'ABNORMAL', label: '异常' }
]
const DISPOSAL_OPTIONS = [
  { value: 'REPAIR', label: '转维修单' },
  { value: 'CHANGE', label: '转变更单' },
  { value: 'EXPLAINED', label: '已说明' }
]
const STATUS_TEXT = {
  RECORDED: '登记成功',
  DUPLICATE: '重复扫码',
  IDEMPOTENT: '已登记（重复提交）',
  NOT_IN_SCOPE: '清单外资产',
  ERROR: '未能登记'
}
const RESULT_TEXT = {
  MATCHED: '账实相符', SURPLUS: '盘盈', LOSS: '盘亏', ABNORMAL: '异常', UNCHECKED: '未盘'
}

const videoRef = ref(null)
const gunInput = ref(null)
const docs = ref([])
const docsLoading = ref(false)
const docId = ref(String(route.query.docId || ''))
const counted = ref(0)
const total = ref(0)
const scanning = ref(false)
const wanted = ref(false)
const cameraError = ref('')
const cameraErrorCert = ref(false)
const busy = ref(false)
const lastResult = ref(null)
const recent = ref([])
const gunText = ref('')
const showManual = ref(false)
const manualForm = ref({ assetNo: '', result: 'LOSS', remark: '', disposal: '' })

let scanner = null
let chain = Promise.resolve()

const percent = computed(() => total.value > 0 ? Math.min(100, Math.round(counted.value / total.value * 100)) : 0)
const canStart = computed(() => !!docId.value && !!secure)
const primaryText = computed(() => scanning.value ? '结束盘点' : '开始盘点')

const statusText = (s) => STATUS_TEXT[s] || '未能登记'
const resultText = (r) => RESULT_TEXT[r] || r || ''

function syncProgressFromDocs() {
  const doc = docs.value.find(d => d.id === docId.value)
  if (doc) {
    counted.value = Number(doc.counted) || 0
    total.value = Number(doc.total) || 0
  }
}
watch(docId, syncProgressFromDocs)

async function reloadDocs(silent = false) {
  docsLoading.value = true
  try {
    docs.value = await fetchScanDocs()
    if (docId.value && !docs.value.some(d => d.id === docId.value)) {
      // 从列表带过来的单据若已不可盘（例如已提交审批），不要静默改写到别张单
      docId.value = ''
      if (!silent) cameraError.value = '该盘点单已不可登记明细，请重新选择'
    }
    syncProgressFromDocs()
  } catch (e) {
    if (!silent) cameraError.value = e?.message || '盘点单加载失败'
  } finally {
    docsLoading.value = false
  }
}

function applyResult(res, fallbackNo) {
  const r = res || {}
  lastResult.value = { ...r, assetNo: r.assetNo || fallbackNo }
  // 并发下响应可能乱序，进度只增不减
  if (Number.isFinite(Number(r.counted))) counted.value = Math.max(counted.value, Number(r.counted))
  if (Number.isFinite(Number(r.total))) total.value = Number(r.total)
  if (r.status === 'RECORDED' && navigator.vibrate) {
    try { navigator.vibrate(40) } catch (e) { /* 部分浏览器不支持 */ }
  }
  recent.value.unshift({
    assetNo: lastResult.value.assetNo || '-',
    status: r.status || 'ERROR',
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
  })
  recent.value = recent.value.slice(0, 6)
}

async function submitRecord(assetNo, options = {}) {
  if (!docId.value) {
    lastResult.value = { status: 'ERROR', assetNo, message: '请先选择盘点单' }
    return
  }
  busy.value = true
  try {
    const res = await recordScan(docId.value, {
      assetNo,
      result: options.result || 'MATCHED',
      remark: options.remark || '',
      disposal: options.disposal || '',
      clientScanId: newScanId(),
      overwrite: !!options.overwrite
    })
    applyResult(res, assetNo)
  } catch (err) {
    lastResult.value = { status: 'ERROR', assetNo, message: err?.message || '登记失败' }
  } finally {
    busy.value = false
  }
}

/** 串行提交：连续快速扫码时不并发打服务端，避免无谓的乐观锁冲突重试 */
function enqueue(assetNo, options) {
  chain = chain
    .then(() => submitRecord(assetNo, options))
    .catch(err => {
      lastResult.value = { status: 'ERROR', assetNo, message: err?.message || '登记失败' }
    })
  return chain
}

function onCode(raw) {
  const assetNo = decodeAssetQr(raw)
  if (!assetNo) {
    lastResult.value = { status: 'ERROR', assetNo: String(raw || '').slice(0, 30), message: '无法识别该二维码内容，请用扫码枪或手动输入' }
    return
  }
  enqueue(assetNo)
}

function submitGun() {
  const text = gunText.value.trim()
  gunText.value = ''
  if (!text) return
  const assetNo = decodeAssetQr(text)
  if (!assetNo) {
    lastResult.value = { status: 'ERROR', assetNo: text.slice(0, 30), message: '无法识别输入内容' }
    return
  }
  enqueue(assetNo)
  nextTick(() => gunInput.value?.focus())
}

function openManual(assetNo) {
  manualForm.value = { assetNo, result: 'LOSS', remark: '', disposal: '' }
  showManual.value = true
}

function submitManual() {
  const form = manualForm.value
  const assetNo = decodeAssetQr(form.assetNo) || ''
  if (!assetNo) {
    lastResult.value = { status: 'ERROR', message: '请填写资产编号' }
    return
  }
  if (form.result !== 'MATCHED' && !String(form.remark || '').trim()) {
    lastResult.value = { status: 'ERROR', assetNo, message: '盘盈 / 盘亏 / 异常必须填写原因' }
    return
  }
  if (form.result === 'ABNORMAL' && !form.disposal) {
    lastResult.value = { status: 'ERROR', assetNo, message: '异常资产必须选择处理去向' }
    return
  }
  enqueue(assetNo, {
    result: form.result,
    remark: String(form.remark || '').trim(),
    disposal: form.result === 'ABNORMAL' ? form.disposal : '',
    overwrite: true
  })
  showManual.value = false
}

function friendlyCameraError(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '摄像头权限被拒绝，请在浏览器地址栏允许摄像头后重试'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '未找到可用摄像头；可改用扫码枪或手动输入'
  if (name === 'NotReadableError' || name === 'TrackStartError') return '摄像头被其它应用占用，请关闭后重试'
  return err?.message || '摄像头启动失败'
}

function goCertGuide() {
  stopCamera()
  router.push({ path: '/cert-guide', query: docId.value ? { docId: docId.value } : {} })
}

async function startCamera() {
  cameraError.value = ''
  cameraErrorCert.value = false
  if (!docId.value) { cameraError.value = '请先选择盘点单'; return }
  if (!secure) { cameraError.value = '需要 HTTPS 安全上下文'; cameraErrorCert.value = true; return }
  wanted.value = true
  try {
    await nextTick()
    if (!scanner) scanner = new ContinuousScanner(videoRef.value, onCode)
    await scanner.start()
    scanning.value = true
    gunInput.value?.blur()
  } catch (err) {
    wanted.value = false
    cameraError.value = friendlyCameraError(err)
    // NotAllowedError 在未信任自签证书的 Android Chrome 上极常见（isSecureContext 仍为 true），
    // 直接给出证书引导按钮，不让人卡在一句报错上
    const name = err?.name || ''
    cameraErrorCert.value = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
  }
}

function stopCamera() {
  wanted.value = false
  scanner?.stop()
  scanning.value = false
}

function toggleScan() {
  if (scanning.value) {
    stopCamera()
    const pending = Math.max(0, total.value - counted.value)
    lastResult.value = pending
      ? { status: 'ERROR', message: `已结束扫码，还有 ${pending} 项未盘，可在盘点清单继续登记` }
      : { status: 'RECORDED', message: '本单已盘完，请回盘点单列表点击「结束盘点」并提交审批' }
    if (!isPhone.value) gunInput.value?.focus()
  } else {
    startCamera()
  }
}

function goBack() {
  stopCamera()
  router.push({ path: '/fixed-assets', query: { tab: 'inventory', sub: 'docs' } })
}

function onVisibility() {
  if (document.hidden && scanning.value) {
    scanner?.stop()
    scanning.value = false
  } else if (!document.hidden && wanted.value && !scanning.value && docId.value) {
    startCamera()
  }
}

onMounted(async () => {
  await reloadDocs(true)
  document.addEventListener('visibilitychange', onVisibility)
  if (!isPhone.value) gunInput.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  scanner?.stop()
  scanner = null
})
</script>

<style scoped>
.scan-page {
  min-height: 100%;
  padding: 12px 12px calc(var(--safe-bottom, 0px) + 88px);
  background: var(--bg-page, #f5f7fa);
  color: var(--t-main, #1f2937);
}
.scan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  margin-bottom: 10px;
}
.scan-head__title { font-size: 16px; font-weight: 600; }
.scan-head__btn,
.scan-toolbar button,
.scan-manual__ops button,
.scan-result__ops button {
  min-height: var(--touch-min, 40px);
  padding: 0 14px;
  border: 1px solid var(--bd, #dcdfe6);
  border-radius: var(--r-md, 8px);
  background: var(--bg-card, #fff);
  color: var(--t-main, #1f2937);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.scan-card, .scan-view, .scan-result, .scan-gun, .scan-recent, .scan-manual, .scan-alert {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--bd, #dcdfe6);
  border-radius: var(--r-md, 8px);
  background: var(--bg-card, #fff);
}
.scan-doc-row label, .scan-gun label, .scan-manual label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--t-sub, #6b7280);
}
.scan-progress { margin-top: 10px; font-size: 13px; }
.scan-progress b { color: var(--c-primary, #409eff); }
.scan-hint, .scan-result__msg { margin: 8px 0 0; font-size: 12px; color: var(--t-sub, #6b7280); }
.scan-empty button {
  min-height: var(--touch-min, 40px);
  margin-top: 8px;
  padding: 0 14px;
  border: 1px solid var(--bd, #dcdfe6);
  border-radius: var(--r-md, 8px);
  background: var(--bg-card, #fff);
  color: var(--t-main, #1f2937);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.scan-alert { border-color: #e6a23c; background: #fdf6ec; font-size: 13px; line-height: 1.6; }
.scan-view { position: relative; padding: 0; overflow: hidden; background: #000; }
.scan-video { display: block; width: 100%; max-height: 42vh; min-height: 180px; object-fit: contain; }
.scan-view__mask, .scan-view__err {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  font-size: 13px;
  color: #fff;
  background: rgba(0, 0, 0, .62);
}
.scan-view__err p { margin: 0; }
.scan-view__errhint { font-size: 12px; color: #fbc87d; }
.scan-view__certbtn {
  min-height: var(--touch-min, 40px);
  padding: 0 16px;
  border: none;
  border-radius: var(--r-md, 8px);
  background: var(--c-primary, #409eff);
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.scan-view__live {
  position: absolute;
  top: 8px; left: 8px;
  padding: 3px 8px;
  border-radius: 10px;
  background: rgba(103, 194, 58, .9);
  color: #fff;
  font-size: 12px;
}
.scan-result.is-recorded { border-color: #67c23a; background: #f0f9eb; }
.scan-result.is-duplicate { border-color: #e6a23c; background: #fdf6ec; }
.scan-result.is-idempotent { border-color: #909399; }
.scan-result.is-not_in_scope { border-color: var(--c-primary, #409eff); background: #ecf5ff; }
.scan-result.is-error { border-color: #f56c6c; background: #fef0f0; }
.scan-result__head { display: flex; justify-content: space-between; font-size: 15px; }
.scan-result__busy { font-size: 12px; color: var(--t-sub, #6b7280); }
.scan-result__body { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; font-size: 13px; }
.scan-result__code { font-weight: 600; }
.scan-result__ops { display: flex; gap: 8px; margin-top: 8px; }
.scan-manual input, .scan-gun input {
  width: 100%;
  min-height: var(--touch-min, 40px);
  margin-bottom: 8px;
  padding: 0 10px;
  border: 1px solid var(--bd, #dcdfe6);
  border-radius: var(--r-md, 8px);
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
}
.scan-manual__title { margin-bottom: 8px; font-weight: 600; font-size: 14px; }
.scan-manual__ops { display: flex; gap: 8px; }
.scan-recent__title { margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.scan-recent__row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-top: 1px solid var(--bd, #dcdfe6); font-size: 12px; }
.scan-recent__time { color: var(--t-sub, #6b7280); }
.scan-toolbar { display: flex; gap: 8px; }
.scan-toolbar button { flex: 1; }
.scan-toolbar .is-primary, .scan-manual__ops button:first-child {
  border-color: var(--c-primary, #409eff);
  background: var(--c-primary, #409eff);
  color: #fff;
}
button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 767px) {
  .scan-toolbar { display: none; }
}
@media (min-width: 768px) {
  .scan-page { max-width: 720px; margin: 0 auto; }
}
</style>
