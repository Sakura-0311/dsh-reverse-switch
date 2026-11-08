/**
 * Host half of dsh-reverse-switch.
 *
 * 只做一件事：给「逆向模式」面板提供读写 MCP 开关的 HTTP 接口。
 *
 * 开关的真身是 profile patch（`~/.dsh/profiles/<name>/cordis.patch.yml`）里
 * 两条 `@deepseek-ai/dsh-mcp-client` 条目上的 `disabled` 字段。写文件即触发 DSH
 * 的 HMR 重新组合，所以这里不需要调用任何重载 API —— 落盘即生效。
 *
 * 采用行级编辑而不是 YAML 解析/序列化：用户的 patch 里全是手写注释，
 * round-trip 会全部丢掉。这里只碰目标条目块内的 `disabled:` 一行。
 *
 * @module dsh-reverse-switch
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const name = 'dsh-reverse-switch'
export const inject = ['webServer']

const NS = 'reverse-switch'
const API_PREFIX = '/plugins/dsh-reverse-switch'
const API_BASE = `${API_PREFIX}/`
/** 改名前的路由前缀，只作为已加载旧 client 页面的兼容别名。 */
const LEGACY_API_PREFIX = '/plugins/dsh-reverse-mode'
const LEGACY_API_BASE = `${LEGACY_API_PREFIX}/`

const CRAFT_CLI = String.raw`E:\wb\craft-anything\craft-anything-0.5.0-windows-x64-portable\craft-anything-cli.exe`
const CRAFT_CWD = String.raw`E:\wb\craft-anything\craft-anything-0.5.0-windows-x64-portable`
const CRAFT_PROJECT = String.raw`E:\wb\craft-anything\projects\dsh.cany`
const REA_NODE = String.raw`E:\node.exe`
const REA_CLI = String.raw`C:\Users\27831\AppData\Roaming\npm\node_modules\rea-agents\scripts\rea.mjs`

/** 两条常驻条目：默认 disabled，点「逆向模式」时一起打开。 */
const ENTRIES = [
  {
    key: 'rea',
    id: 'mcp-rea',
    label: 'REA',
    prefix: 'mcp__rea__',
    hint: 'rea-agents 6.4.0 · 170 工具',
    yaml: [
      `    - id: mcp-rea`,
      `      name: '@deepseek-ai/dsh-mcp-client'`,
      `      disabled: true`,
      `      config:`,
      `        serverName: rea`,
      `        transport: stdio`,
      `        command: '${REA_NODE}'`,
      `        args: ['${REA_CLI}', '--mcp']`,
      `        toolCallTimeoutMs: 300000`,
      `        failOnStartupError: false`,
    ].join('\n'),
  },
  {
    key: 'craft',
    id: 'mcp-craft-anything',
    label: 'Craft Anything',
    prefix: 'mcp__craft-anything__',
    hint: 'craft-anything 0.5.0 · Deep 模式 · Essentials 36 工具',
    yaml: [
      `    - id: mcp-craft-anything`,
      `      name: '@deepseek-ai/dsh-mcp-client'`,
      `      disabled: true`,
      `      config:`,
      `        serverName: craft-anything`,
      `        transport: stdio`,
      `        command: '${CRAFT_CLI}'`,
      `        args:`,
      `          - mcp`,
      `          - --deep`,
      `          - --project`,
      `          - '${CRAFT_PROJECT}'`,
      `        cwd: '${CRAFT_CWD}'`,
      `        toolCallTimeoutMs: 300000`,
      `        failOnStartupError: false`,
    ].join('\n'),
  },
]

// ── 文件定位 ──────────────────────────────────────────────────────────────

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return path.join(os.homedir(), '.dsh')
}

async function exists(file) {
  try {
    await fs.stat(file)
    return true
  } catch {
    return false
  }
}

/** 所有可能持有这两条条目的 patch 文件，优先级高在前。 */
async function patchFiles() {
  const home = dshHome()
  const out = []
  const profilesDir = path.join(home, 'profiles')
  let names = []
  try {
    names = await fs.readdir(profilesDir)
  } catch {
    names = []
  }
  const preferred = ['desktop', 'web', 'headless']
  names.sort((a, b) => {
    const ai = preferred.indexOf(a)
    const bi = preferred.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  for (const n of names) {
    const file = path.join(profilesDir, n, 'cordis.patch.yml')
    if (await exists(file)) out.push(file)
  }
  const globalPatch = path.join(home, 'cordis.patch.yml')
  if (await exists(globalPatch)) out.push(globalPatch)
  return out
}

// ── 行级 YAML 读写 ────────────────────────────────────────────────────────

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 定位 `- id: <id>` 条目块，返回行区间与缩进。 */
function entryRange(lines, id) {
  const head = new RegExp(`^(\\s*)-\\s*id:\\s*['"]?${escapeRe(id)}['"]?\\s*$`)
  for (let i = 0; i < lines.length; i += 1) {
    const match = head.exec(lines[i])
    if (match === null) continue
    const indent = match[1].length
    let end = lines.length - 1
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]
      if (line.trim() === '') continue
      const nextItem = /^(\s*)-\s+\S/.exec(line)
      if (nextItem !== null && nextItem[1].length <= indent) {
        end = j - 1
        break
      }
      if (/^\S/.test(line)) {
        end = j - 1
        break
      }
    }
    return { start: i, end, indent }
  }
  return null
}

function fieldIndentOf(lines, range) {
  for (let i = range.start + 1; i <= range.end; i += 1) {
    const match = /^(\s+)(name|config|disabled):/.exec(lines[i])
    if (match !== null) return match[1].length
  }
  return range.indent + 2
}

function readEntry(text, id) {
  const lines = text.split('\n')
  const range = entryRange(lines, id)
  if (range === null) return { exists: false, enabled: false }
  const fieldIndent = fieldIndentOf(lines, range)
  for (let i = range.start + 1; i <= range.end; i += 1) {
    const match = /^(\s*)disabled:\s*(.*)$/.exec(lines[i])
    if (match === null) continue
    const value = match[2].trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    return { exists: true, enabled: value !== 'true' }
  }
  return { exists: true, enabled: true, fieldIndent }
}

/** 设置（或插入）条目块里的 `disabled:` 字段，返回新文本。 */
function writeEntry(text, entry, disabled) {
  const lines = text.split('\n')
  const range = entryRange(lines, entry.id)
  const value = disabled ? 'true' : 'false'

  if (range === null) {
    // 条目不存在：追加一个 insert 块（幂等；重复调用不会重复追加）。
    const block = [
      '',
      `# reverse-switch: ${entry.label}（由 dsh-reverse-switch 自动补写）`,
      '- insert:',
      entry.yaml.replace(/^(\s*disabled:\s*)true\s*$/m, `$1${value}`),
    ].join('\n')
    const merged = `${text.replace(/\s*$/, '')}\n${block}\n`
    return { text: merged, changed: true }
  }

  const fieldIndent = fieldIndentOf(lines, range)
  for (let i = range.start + 1; i <= range.end; i += 1) {
    const match = /^(\s*)disabled:/.exec(lines[i])
    if (match === null) continue
    const next = `${match[1]}disabled: ${value}`
    if (next === lines[i]) return { text, changed: false }
    lines[i] = next
    return { text: lines.join('\n'), changed: true }
  }

  // 没有 disabled 字段：插到块内最后一个非空行之后。
  let last = range.end
  while (last > range.start && lines[last].trim() === '') last -= 1
  lines.splice(last + 1, 0, `${' '.repeat(fieldIndent)}disabled: ${value}`)
  return { text: lines.join('\n'), changed: true }
}

// ── 状态 ──────────────────────────────────────────────────────────────────

let queue = Promise.resolve()

function serialized(task) {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

async function readStatus() {
  const files = await patchFiles()
  const loaded = []
  for (const file of files) {
    let text = ''
    try {
      text = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }
    loaded.push({ file, text })
  }

  const targets = ENTRIES.map((entry) => {
    const hits = loaded
      .map((row) => ({ file: row.file, state: readEntry(row.text, entry.id) }))
      .filter((row) => row.state.exists)
    const first = hits[0]
    return {
      key: entry.key,
      id: entry.id,
      label: entry.label,
      prefix: entry.prefix,
      hint: entry.hint,
      exists: hits.length > 0,
      enabled: first === undefined ? false : first.state.enabled,
      file: first === undefined ? null : first.file,
    }
  })

  const enabledCount = targets.filter((row) => row.enabled).length
  const mode =
    enabledCount === targets.length ? 'on' : enabledCount === 0 ? 'off' : 'mixed'
  const held = [...new Set(targets.map((row) => row.file).filter((row) => row !== null))]
  return { ok: true, mode, enabled: enabledCount > 0, targets, files: held }
}

async function applyMode(mode) {
  const status = await readStatus()
  const resolved =
    mode === 'on' ? true : mode === 'off' ? false : !(status.targets.length > 0 && status.targets.every((row) => row.enabled))

  const files = await patchFiles()
  if (files.length === 0) {
    return { ok: false, error: 'no profile patch file found under ~/.dsh/profiles' }
  }
  const primary = files[0]

  for (const entry of ENTRIES) {
    const holding = []
    for (const file of files) {
      let text = ''
      try {
        text = await fs.readFile(file, 'utf8')
      } catch {
        continue
      }
      if (readEntry(text, entry.id).exists) holding.push({ file, text })
    }
    const targets = holding.length > 0 ? holding : [{ file: primary, text: await fs.readFile(primary, 'utf8').catch(() => '') }]
    for (const row of targets) {
      const { text, changed } = writeEntry(row.text, entry, !resolved)
      if (!changed) continue
      await fs.writeFile(row.file, text, 'utf8')
    }
  }

  // 不重新读盘：写入之后 DSH 立刻开始重载这个 profile，任何读盘都会撞在重载窗口里，
  // 而且重载会连带拆掉本插件自己的路由。直接用写入结果构造响应，客户端凭 reloading
  // 自己等路由恢复（面板会显示「重载中」并轮询），避免把重载期的 405/404 当成失败。
  const targets = status.targets.map((row) => ({ ...row, exists: true, enabled: resolved }))
  return {
    ok: true,
    mode: resolved ? 'on' : 'off',
    enabled: resolved,
    targets,
    files: [...new Set(targets.map((row) => row.file).filter((row) => row !== null))],
    reloading: true,
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function readBody(request, limit = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw === '' ? {} : JSON.parse(raw)
}

export function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    const handler = async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      let route = url.pathname.slice(API_PREFIX.length).replace(/^\//, '')
      if (url.pathname.startsWith(API_BASE)) route = url.pathname.slice(API_BASE.length)
      else if (url.pathname.startsWith(LEGACY_API_BASE)) route = url.pathname.slice(LEGACY_API_BASE.length)
      const method = request.method ?? 'GET'
      try {
        if (method === 'GET' && route === 'status') {
          sendJson(response, 200, await serialized(readStatus))
          return
        }
        if (method === 'POST' && route === 'toggle') {
          const body = await readBody(request)
          const mode = typeof body.mode === 'string' ? body.mode : 'toggle'
          if (!['on', 'off', 'toggle'].includes(mode)) {
            sendJson(response, 400, { ok: false, error: `bad mode: ${mode}` })
            return
          }
          sendJson(response, 200, await serialized(() => applyMode(mode)))
          return
        }
        sendJson(response, 404, { ok: false, error: `no such route: ${route}` })
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 旧前缀是给「已经加载了改名之前那份 client bundle 的页面」的兼容别名：
    // client 模块只在页面重载时才替换，而页面在 DSH 重启前不会重载，所以这段时间
    // 里的请求仍然打到 /plugins/dsh-reverse-mode/... 。host 侧同时接住两边，
    // 面板就不用等重启才恢复。下次启动后两份代码一致，这个别名继续无害。
    const disposes = [API_PREFIX, LEGACY_API_PREFIX].map((path) =>
      hostCtx.webServer.register({ kind: 'prefix', path, handler }),
    )
    hostCtx.effect(() => () => {
      for (const dispose of disposes) {
        try {
          dispose()
        } catch {
          // 卸载阶段关掉一半也无所谓
        }
      }
    }, `${NS}: http routes`)
  })
}
