/**
 * 连续扫码摄像头控制器（扫码盘点 P1）。
 *
 * 一次 start() 后摄像头常驻，识别到二维码就回调 onCode(raw)，不跳页、不重复点按钮，
 * 直到调用 stop()。优先使用原生 BarcodeDetector（Android Chrome），
 * 不支持或初始化失败时动态加载 @zxing/browser，从同一条视频流解码。
 *
 * 前置条件由调用方检查：页面必须是安全上下文（HTTPS）且证书被信任，
 * 否则 getUserMedia 会被浏览器拒绝。
 */

/** 同码最小重复间隔，防止一次扫码被多帧重复上报 */
const MIN_INTERVAL = 900
/** 同码在「画面中消失过」之后可再次触发的最短间隔，用于主动重扫同一张标签 */
const RESCAN_AFTER_ABSENT = 700
/** 原生检测轮询间隔 */
const DETECT_INTERVAL = 120

export function cameraCapability() {
  return {
    secure: window.isSecureContext === true,
    media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    native: typeof window.BarcodeDetector === 'function'
  }
}

export class ContinuousScanner {
  /**
   * @param {HTMLVideoElement} video 页面上的取景元素
   * @param {(raw: string) => void} onCode 识别到二维码内容
   */
  constructor(video, onCode) {
    this.video = video
    this.onCode = onCode
    this.stream = null
    this.running = false
    this.timer = 0
    this.detector = null
    this.controls = null
    this.lastCode = ''
    this.lastAt = 0
    this.absent = true
  }

  get isRunning() { return this.running }

  async start() {
    if (this.running) return
    const cap = cameraCapability()
    if (!cap.secure) {
      throw new Error('当前页面不是安全上下文，浏览器禁止调用摄像头；请用 https:// 访问并确认证书已被信任')
    }
    if (!cap.media) {
      throw new Error('当前浏览器不支持摄像头取流；可改用扫码枪或手动输入资产编号')
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    })
    this.video.srcObject = this.stream
    this.video.setAttribute('playsinline', 'true')
    this.video.muted = true
    try { await this.video.play() } catch (e) { /* 部分浏览器需用户手势，忽略 */ }

    if (cap.native) {
      try {
        await this.startNative()
        return
      } catch (e) {
        // 原生实现存在但不支持 qr_code 或 detect 失败：回落 ZXing
        this.detector = null
      }
    }
    await this.startZxing()
  }

  async startNative() {
    let formats = ['qr_code']
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      formats = await window.BarcodeDetector.getSupportedFormats()
    }
    if (!formats.includes('qr_code')) throw new Error('BarcodeDetector 不支持 qr_code')
    this.detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    this.running = true
    const tick = async () => {
      if (!this.running) return
      try {
        if (this.video.readyState >= 2) {
          const codes = await this.detector.detect(this.video)
          if (!codes.length) this.markAbsent()
          else codes.forEach(c => this.accept(c?.rawValue))
        }
      } catch (e) { /* 单帧解码失败不影响后续帧 */ }
      if (this.running) this.timer = setTimeout(tick, DETECT_INTERVAL)
    }
    tick()
  }

  async startZxing() {
    const { BrowserQRCodeReader } = await import('@zxing/browser')
    const reader = new BrowserQRCodeReader()
    this.controls = await reader.decodeFromStream(
      this.stream,
      this.video,
      (result) => {
        if (result) this.accept(result.getText())
        else this.markAbsent()
      }
    )
    this.running = true
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = 0
    try { this.controls?.stop() } catch (e) { /* 已释放 */ }
    this.controls = null
    this.detector = null
    try { this.stream?.getTracks().forEach(t => t.stop()) } catch (e) { /* 已释放 */ }
    this.stream = null
    try { this.video.srcObject = null } catch (e) { /* 已释放 */ }
    this.lastCode = ''
    this.absent = true
  }

  markAbsent() { this.absent = true }

  /**
   * 去重：同一张标签停在镜头前不重复上报；镜头移开再对准同一标签可重新识别。
   */
  accept(raw) {
    if (!this.running) return
    const code = String(raw || '').trim()
    if (!code) { this.markAbsent(); return }
    const now = Date.now()
    if (now - this.lastAt < MIN_INTERVAL) return
    const same = code === this.lastCode
    if (same && !(this.absent && now - this.lastAt >= RESCAN_AFTER_ABSENT)) return
    this.lastCode = code
    this.lastAt = now
    this.absent = false
    this.onCode(code)
  }
}

export default ContinuousScanner
