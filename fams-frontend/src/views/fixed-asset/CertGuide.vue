<template>
  <div class="cert-guide">
    <header class="cg-head">
      <button type="button" @click="goBack">← 返回</button>
      <strong>扫码盘点 · 首次设置</strong>
      <span></span>
    </header>

    <section class="cg-card">
      <p>手机摄像头只能在 <b>HTTPS 安全连接</b>下使用。本系统用自签证书，需要你在手机上<b>安装一次根证书</b>，之后就能一直扫码，不用再设置。</p>

      <div v-if="ready" class="cg-ready">
        <p>✓ 证书已生效，可以开始扫码盘点。</p>
        <button type="button" class="is-primary" @click="goScan">开始扫码</button>
      </div>

      <div v-else>
        <ol class="cg-steps">
          <li>
            <p>下载根证书（点按钮即可，不用手输地址）</p>
            <button type="button" :disabled="downloaded" @click="downloadCert">
              {{ downloaded ? '✓ 已下载 fams-ca.crt' : '下载 fams-ca.crt' }}
            </button>
          </li>
          <li>
            <p><b>重新安装（关键）：必须选「CA 证书」，不要选「VPN 和应用用户证书」</b></p>
            <p class="cg-sub">你之前装成了「用于 VPN 和应用」的用户证书，那是错的，浏览器不会信任它签发的网站证书，所以地址栏还是红叉。请先到「设置 → 安全 → 用户凭据」把旧的 fams local ca 删掉。</p>
            <p class="cg-sub">然后回到下载目录点开 fams-ca.crt，安装类型选第一项 <b>「CA 证书」</b>（列表里的「VPN 和应用用户证书」「WLAN 证书」都不要选）。</p>
            <p class="cg-sub">iPhone：Safari 打开 crt → 设置 → 通用 → VPN 与设备管理 → 安装描述文件 → 证书信任设置里打开完全信任。</p>
          </li>
          <li>
            <p>装好后点下面按钮检测，成功会自动进入扫码页：</p>
            <button type="button" class="is-primary" :disabled="checking" @click="checkReady">
              {{ checking ? '检测中…' : '我已安装，检测并继续' }}
            </button>
          </li>
        </ol>
        <p v-if="error" class="cg-error">{{ error }}</p>
        <button type="button" class="cg-link" @click="goScan">证书已装好？直接进入扫码页</button>
      </div>
    </section>
  </div>
</template>

<script setup>
/**
 * 扫码盘点首次设置：引导下载/安装 CA 根证书，并检测 https 是否已被信任。
 * 运行在 http 页面上，点「开始扫码」才跳 https，避免用户直接跳到证书错误页。
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const ready = ref(false)
const checking = ref(false)
const downloaded = ref(false)
const error = ref('')

const caUrl = `${window.location.protocol}//${window.location.host}/fams-ca.crt`
const httpsBase = `https://${window.location.host}`

function downloadCert() {
  window.location.href = caUrl
  downloaded.value = true
}

async function checkReady() {
  checking.value = true
  error.value = ''
  try {
    // 直接探测 getUserMedia：它才是扫码真正依赖的能力，证书不受信时必然被拒，
    // 比 fetch 更可靠（浏览器已放行当前 https 页时，同源 fetch 可能误判为已信任）。
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头，请用 Chrome 打开')
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: { ideal: 'environment' } }
    })
    stream.getTracks().forEach(t => t.stop())
    ready.value = true
    goScan()
  } catch (e) {
    const name = e?.name || ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      error.value = '摄像头权限未被授予。若地址栏 https 带红色叉号，说明证书还没装好：请先下载并安装 fams-ca.crt，再回来点检测'
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      error.value = '未检测到摄像头；若只是想用扫码枪，可跳过设置直接进扫码页'
    } else {
      error.value = '摄像头不可用：' + (e?.message || name || '未知原因') + '。请确认证书已安装并被信任'
    }
  } finally {
    checking.value = false
  }
}

function goScan() {
  const query = route.query.docId ? `?docId=${encodeURIComponent(route.query.docId)}` : ''
  window.location.href = `${httpsBase}/scan${query}`
}

function goBack() {
  router.push({ path: '/fixed-assets', query: { tab: 'inventory', sub: 'docs' } })
}

onMounted(() => {
  // 已装过证书的用户不必再点：页面打开时静默探测一次，通了就直接放行
  checkReady()
})
</script>

<style scoped>
.cert-guide { min-height: 100vh; padding: 12px; background: #f5f7fa; color: #1f2937; }
.cg-head { display: flex; align-items: center; justify-content: space-between; height: 44px; }
.cg-head button, .cg-card button {
  min-height: 40px; padding: 0 14px; border: 1px solid #dcdfe6; border-radius: 8px;
  background: #fff; color: #1f2937; font-family: inherit; font-size: 14px; cursor: pointer;
}
.cg-head strong { font-size: 16px; }
.cg-card { margin-top: 10px; padding: 16px; border: 1px solid #dcdfe6; border-radius: 8px; background: #fff; line-height: 1.7; font-size: 14px; }
.cg-steps { padding-left: 20px; }
.cg-steps li { margin-bottom: 16px; }
.cg-steps p { margin: 4px 0; }
.cg-sub { font-size: 12px; color: #6b7280; }
.cg-card button.is-primary { border-color: #409eff; background: #409eff; color: #fff; }
.cg-card button:disabled { opacity: .6; cursor: not-allowed; }
.cg-card .cg-ready { padding: 16px; border-radius: 8px; background: #f0f9eb; text-align: center; }
.cg-error { margin-top: 10px; padding: 8px; border-radius: 6px; background: #fef0f0; color: #c45656; font-size: 13px; }
.cg-link { margin-top: 12px; border: none !important; background: transparent !important; color: #409eff !important; font-size: 13px !important; }
</style>
