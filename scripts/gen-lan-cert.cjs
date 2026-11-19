/**
 * 生成内网 HTTPS 证书：本地 CA 根证书 + 含 IP SAN 的服务器证书。
 *
 * 背景：手机 Chrome 调用 getUserMedia 需要安全上下文，http://<内网IP> 不满足；
 * nginx 已有 443，但原 localhost.crt 的 SAN 只含 localhost/127.0.0.1，
 * 手机用 https://<内网IP>/ 访问会报证书名称不匹配，摄像头仍被禁用。
 *
 * 用法：node scripts/gen-lan-cert.cjs [内网IP]
 * 依赖：npm install --prefix scripts/.cert-tools --no-save node-forge
 * 产物：deploy/certs/fams-ca.{crt,key}、lan-server.{crt,key}
 *       并把 fams-ca.crt 复制到前端 public/，手机可用 http://<IP>/fams-ca.crt 下载安装。
 * 注意：*.key 是私钥，已在 .gitignore 中排除，绝不入库；换 IP 时重跑本脚本。
 */
const fs = require('fs')
const path = require('path')
const forge = require('./.cert-tools/node_modules/node-forge')
const pki = forge.pki

const ip = (process.argv[2] || '192.168.60.66').trim()
if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
  console.error('内网 IP 格式不正确:', ip)
  process.exit(1)
}

const outDir = path.resolve(__dirname, '..', 'deploy', 'certs')
fs.mkdirSync(outDir, { recursive: true })

const serial = () => '01' + forge.util.bytesToHex(forge.random.getBytesSync(16))
const inDays = (n) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

// ---- 本地 CA 根证书（手机导入并信任的就是 fams-ca.crt） ----
const caKeys = pki.rsa.generateKeyPair(2048)
const caCert = pki.createCertificate()
caCert.publicKey = caKeys.publicKey
caCert.serialNumber = serial()
caCert.validity.notBefore = inDays(-1)
caCert.validity.notAfter = inDays(3650)
caCert.setSubject([{ name: 'commonName', value: 'FAMS Local CA' }])
caCert.setIssuer([{ name: 'commonName', value: 'FAMS Local CA' }])
caCert.setExtensions([
  { name: 'basicConstraints', cA: true, critical: true },
  { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
  { name: 'subjectKeyIdentifier' }
])
caCert.sign(caKeys.privateKey, forge.md.sha256.create())

// ---- 服务器证书：SAN 必须含手机实际访问的 IP ----
const serverKeys = pki.rsa.generateKeyPair(2048)
const serverCert = pki.createCertificate()
serverCert.publicKey = serverKeys.publicKey
serverCert.serialNumber = serial()
serverCert.validity.notBefore = inDays(-1)
// iOS 只信任有效期 <= 398 天的服务器证书，取 365 天留余量
serverCert.validity.notAfter = inDays(365)
serverCert.setSubject([{ name: 'commonName', value: ip }])
serverCert.setIssuer(caCert.subject.attributes)
serverCert.setExtensions([
  { name: 'basicConstraints', cA: false, critical: true },
  { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
  { name: 'extKeyUsage', serverAuth: true },
  {
    name: 'subjectAltName',
    altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip },
      { type: 7, ip: '127.0.0.1' }
    ]
  },
  { name: 'subjectKeyIdentifier' }
])
serverCert.sign(caKeys.privateKey, forge.md.sha256.create())

const files = {
  'fams-ca.crt': pki.certificateToPem(caCert),
  'fams-ca.key': pki.privateKeyToPem(caKeys.privateKey),
  'lan-server.crt': pki.certificateToPem(serverCert),
  'lan-server.key': pki.privateKeyToPem(serverKeys.privateKey),
  // nginx 用 lan-chain.crt：叶子 + CA 的完整链，安卓浏览器对不完整链会拒绝信任
  'lan-chain.crt': pki.certificateToPem(serverCert) + pki.certificateToPem(caCert)
}
for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), content, 'utf8')
}

// 手机安装 CA 根证书：走 http 80 下载，避免「证书尚未信任时无法下载证书」的死循环
const pubDir = path.resolve(__dirname, '..', 'fams-frontend', 'public')
if (fs.existsSync(pubDir)) {
  fs.writeFileSync(path.join(pubDir, 'fams-ca.crt'), files['fams-ca.crt'], 'utf8')
}

console.log('证书已生成:', outDir)
console.log('SAN:', ip, '| localhost | 127.0.0.1')
console.log('手机安装 fams-ca.crt 后访问 https://' + ip + '/')
