/**
 * 用 DSH 自己的校验器验证 market/index.json。
 * 从 DSH 安装目录解析 @deepseek-ai/dsh-plugin-market-index，规则与「发现」页一致。
 *
 * 用法：node scripts/validate-index.mjs [index路径或URL的基线]
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const DSH_DIR = 'E:\\新建文件夹 (2)\\resources\\app\\dsh'
const require = createRequire(path.join(DSH_DIR, 'package.json'))
const { parseMarketIndex } = require('@deepseek-ai/dsh-plugin-market-index')

const root = path.resolve(import.meta.dirname, '..')
const indexPath = path.join(root, 'market', 'index.json')
const raw = readFileSync(indexPath, 'utf8')
// 索引将来托管在哪，就把它当作相对图标的基准；可用 --base 覆盖。
const baseFlag = process.argv.indexOf('--base')
const indexUrl =
  baseFlag !== -1 && process.argv[baseFlag + 1] !== undefined
    ? process.argv[baseFlag + 1]
    : 'https://cdn.jsdelivr.net/npm/dsh-reverse-switch/market/index.json'

let parsed
try {
  parsed = parseMarketIndex(JSON.parse(raw), indexUrl)
} catch (error) {
  console.error('INVALID:', error?.path ?? '', '->', error?.message)
  process.exit(1)
}

const plugin = parsed.plugins[0]
console.log('OK format:', parsed.format)
console.log('title:', JSON.stringify(parsed.title))
console.log('plugins:', parsed.plugins.length)
console.log('name:', plugin.name)
console.log('icon:', plugin.icon)
console.log('versions:', plugin.versions.map((v) => v.version).join(', '))
console.log('labels:', JSON.stringify(plugin.metadata?.labels))
