/**
 * 生成 market/index.json（DSH 插件市场索引 format 1）。
 *
 * 两种来源：
 *   npm  —— 索引随包走，jsDelivr 托管：https://cdn.jsdelivr.net/npm/<pkg>/market/index.json
 *   git  —— 不需要 npm 账号。把仓库推到 Gitee/GitHub，索引里钉死 commit；
 *           DSH 安装时执行 git+<url>#<commit>。国内网络走 Gitee 最稳。
 *
 * 用法：
 *   node scripts/build-index.mjs                          # npm 源，时间戳=现在
 *   node scripts/build-index.mjs --source git --repo https://gitee.com/<user>/dsh-reverse-switch
 *   node scripts/build-index.mjs --source git --repo <url> --commit <sha> --path packages/dsh-reverse-switch
 *   node scripts/build-index.mjs --timestamp 1794059146    # 指定发布时间
 */
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

const sourceKind = arg('source', 'npm')
const stamp = Number(arg('timestamp', Math.floor(Date.now() / 1000)))

const iconPath = path.join(root, 'market', 'icons', 'reverse-mode.svg')
const iconBytes = statSync(iconPath).size
if (iconBytes > 32 * 1024) {
  throw new Error(`icon too large for inline use: ${String(iconBytes)} bytes`)
}

let source
if (sourceKind === 'git') {
  const repo = arg('repo', '')
  if (repo === '') {
    throw new Error('--repo is required with --source git (e.g. https://gitee.com/<user>/dsh-reverse-switch)')
  }
  let commit = arg('commit', '')
  if (commit === '') {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`commit must be a 40-char lowercase sha, got: ${commit}`)
  }
  source = { type: 'git', url: repo.replace(/\.git$/, ''), commit }
  const sub = arg('path', '')
  if (sub !== '') source.path = sub
} else {
  source = { type: 'npm' }
  const registry = arg('registry', '')
  if (registry !== '') source.registry = registry
}

const index = {
  format: 1,
  title: { en: 'YG · DSH plugins', zh: 'YG · DSH 插件' },
  description: {
    en: 'Plugins for DeepSeek Harness maintained by YG.',
    zh: 'YG 维护的 DeepSeek Harness 插件。',
  },
  metadata: {
    categories: {
      'developer-tools': { title: { en: 'Developer tools', zh: '开发者工具' } },
    },
    labels: {
      'reverse-engineering': { title: { en: 'Reverse engineering', zh: '逆向' } },
      mcp: { title: { en: 'MCP', zh: 'MCP' } },
    },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Reverse switch', zh: '逆向开关' },
      description: {
        en: 'A sidebar entry that turns both reverse-engineering MCP backends on or off at once: REA (rea-agents) and Craft Anything. Off by default, so the toolchain costs no context until you click it.',
        zh: '左侧栏一个「逆向」入口，一键同时启停两套逆向 MCP 后端：REA（rea-agents）与 Craft Anything。默认关闭，不占用上下文，点了才起来。',
      },
      icon: 'icons/reverse-mode.svg',
      author: typeof pkg.author === 'string' ? pkg.author : 'YG',
      homepage: pkg.homepage,
      metadata: {
        category: 'developer-tools',
        labels: ['reverse-engineering', 'mcp'],
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: stamp,
          source,
          engines: { dsh: pkg.engines?.dsh ?? '>=0.2.0-rc.2' },
        },
      ],
    },
  ],
}

const out = path.join(root, 'market', 'index.json')
writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(`wrote ${out}`)
console.log(`  ${pkg.name}@${pkg.version}  source=${sourceKind}  timestamp=${String(stamp)}`)
if (sourceKind === 'git') console.log(`  ${source.url}#${source.commit}${source.path ? ` path:${source.path}` : ''}`)
if (!existsSync(path.join(root, '.git'))) console.log('  (note: no .git here — commit came from elsewhere)')
