/**
 * 用 Gitee Contents API 把插件推上去（git push 的 HTTPS 通道在这条网络上会被断开）。
 *
 * 顺序很重要：
 *   1. 先上传代码文件，拿到最后一个 commit 的 sha
 *   2. 用这个 sha 生成 market/index.json（索引钉死 commit，DSH 安装时 checkout 它）
 *   3. 再上传 index.json
 * 这样索引里指向的 commit 一定包含完整的插件代码。
 *
 * 用法：node scripts/gitee-upload.cjs --token <token> [--branch master] [--dry]
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const OWNER = 'yuluo4106'
const REPO = 'dsh-reverse-switch'
const API = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}/contents`

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

const token = arg('token', process.env.GITEE_TOKEN ?? '')
const branch = arg('branch', 'master')
const dry = process.argv.includes('--dry')
if (token === '') throw new Error('--token or GITEE_TOKEN is required')

// 上传顺序：代码先行，索引最后（索引要钉住代码的 commit）
const SKIP = new Set(['market/index.json'])
const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s !== '' && !SKIP.has(s))

async function put(filePath, message) {
  const abs = path.join(ROOT, filePath)
  const content = fs.readFileSync(abs).toString('base64')
  const body = JSON.stringify({ access_token: token, content, message, branch })
  const res = await fetch(`${API}/${encodeURI(filePath)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json;charset=UTF-8' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    // 已存在时改为更新（PUT）
    if (res.status === 400 || res.status === 409 || text.includes('already exists')) {
      const sha = await headSha(filePath)
      if (sha !== null) {
        const res2 = await fetch(`${API}/${encodeURI(filePath)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json;charset=UTF-8' },
          body: JSON.stringify({ access_token: token, content, message, branch, sha }),
        })
        const t2 = await res2.text()
        if (!res2.ok) throw new Error(`PUT ${filePath} -> ${String(res2.status)} ${t2.slice(0, 200)}`)
        const j2 = JSON.parse(t2)
        return j2.commit?.sha ?? null
      }
    }
    throw new Error(`POST ${filePath} -> ${String(res.status)} ${text.slice(0, 200)}`)
  }
  const json = JSON.parse(text)
  return json.commit?.sha ?? null
}

async function headSha(filePath) {
  const res = await fetch(`${API}/${encodeURI(filePath)}?access_token=${token}&ref=${branch}`)
  if (!res.ok) return null
  const json = await res.json()
  return typeof json.sha === 'string' ? json.sha : null
}

async function main() {
  if (dry) {
    console.log('files to upload:')
    for (const f of files) console.log('  ' + f)
    console.log('  market/index.json  (generated after)')
    return
  }

  let last = null
  for (const f of files) {
    const sha = await put(f, `add ${f}`)
    last = sha ?? last
    console.log(`uploaded ${f}  commit=${sha === null ? '?' : sha.slice(0, 8)}`)
  }
  if (last === null) throw new Error('no commit sha returned from API')
  console.log('\ncode commit: ' + last)

  const out = execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts', 'build-index.mjs'),
      '--source',
      'git',
      '--repo',
      `https://gitee.com/${OWNER}/${REPO}`,
      '--commit',
      last,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  )
  process.stdout.write(out)

  const idxSha = await put('market/index.json', 'index: pin ' + last.slice(0, 7))
  console.log('uploaded market/index.json  commit=' + (idxSha === null ? '?' : idxSha.slice(0, 8)))
  console.log(`\nindex URL: https://gitee.com/${OWNER}/${REPO}/raw/${branch}/market/index.json`)
}

main().catch((error) => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
