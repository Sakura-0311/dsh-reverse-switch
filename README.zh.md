# dsh-reverse-switch · 逆向模式

DSH 内置插件：左侧栏加一个「🔬 逆向」入口，一键同时启用 / 关闭两套逆向后端。

| 后端 | 包 | 开启后工具前缀 | 规模 |
|---|---|---|---|
| **REA** | `rea-agents` 6.4.0（全局 `rea`） | `mcp__rea__*` | 170 工具 + 6 提示模板 |
| **Craft Anything** | `craft-anything-cli` 0.5.0（portable） | `mcp__craft-anything__*` | Essentials 36 工具，可 `enable_toolset` 扩到 300+ |

默认两者都是 `disabled: true` —— 逆向工具链不进上下文、不占权限面。点一下才起来。

## 它到底做了什么

开关的真身是 profile patch（`~/.dsh/profiles/<name>/cordis.patch.yml`）里两条
`@deepseek-ai/dsh-mcp-client` 条目的 `disabled` 字段。插件落盘后由 DSH 自己的 HMR
重新组合 loader，因此不需要重启应用。

写入是**行级编辑**，不是 YAML round-trip：用户 patch 里全是手写注释，序列化会全部丢掉，
所以只改写目标条目块内的 `disabled:` 一行；条目不存在时追加一个带注释的 `- insert:` 块。

## 结构

```
package.json          dsh.manifestVersion / bundle.patch / client.inject
cordis.patch.yml      - insert: [{ id: reverse-mode, name: dsh-reverse-switch }]
lib/index.js          host：inject ['webServer']，注册 /plugins/dsh-reverse-switch/{status,toggle}
lib/client.js         浏览器：sidebar.panellist「逆向」+ main 面板（无构建，React.createElement）
```

## HTTP

```
GET  /plugins/dsh-reverse-switch/status
POST /plugins/dsh-reverse-switch/toggle   {"mode":"on" | "off" | "toggle"}
```

## 安装（已经在 desktop profile 里装好了）

```powershell
New-Item -ItemType Junction `
  -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-reverse-switch" `
  -Target "E:\wb\dsh-reverse-switch"
```

然后在该 profile 的 `package.json` 里：`dependencies` 加 `"dsh-reverse-switch": "file:E:/wb/dsh-reverse-switch"`，
`dsh.profile.bundles` 加 `"dsh-reverse-switch"`。改 bundles 会触发重载，侧栏项随即出现。

不用 pnpm 安装 —— 直接建 junction 更干净，不碰 lockfile 和其他依赖。

## 注意

- 切换会触发整个 profile 重新组合（DSH 的机制），MCP 连接重建需要几秒，工具在下一轮出现。
- `E:\node.exe` 与 `rea-agents` 安装路径写死在 `lib/index.js` 顶部的常量里；换机/升级要改这里。
- craft-anything 以 `--deep --project E:\wb\craft-anything\projects\dsh.cany` 启动：Deep 模式才能读目标代码/文件，证据与会话落在该 `.cany` 项目里。

## 发布：两条路，npm 不是必须的

### A. Git 源（不需要 npm 账号，国内可用）

DSH 的索引 format 1 支持 git 源，索引里钉死 40 位 commit，安装时 DSH 执行
`git+<url>#<commit>`。所以只要一个公开仓库就够：

```powershell
# 1. 在 Gitee 建一个空仓库（不要初始化 README）
# 2. 一条命令搞定：提交代码 → 用该 commit 重新生成索引 → 提交索引 → 推送
.\publish-gitee.ps1 -Repo https://gitee.com/<你>/dsh-reverse-switch
```

它会打印索引地址，形如：

```
https://gitee.com/<你>/dsh-reverse-switch/raw/main/market/index.json
```

把它加进 DSH：**插件 → 发现 → 索引源**。

索引里的图标用相对路径 `icons/reverse-mode.svg`，会相对索引 URL 解析成
`.../raw/main/market/icons/reverse-mode.svg`，不用改文件。

### B. npm 源（需要 npm 账号）

```powershell
.\publish.ps1 -DryRun     # 先看会发什么
.\publish.ps1             # 真正发布
```

索引随包上传，用 jsDelivr 托管：

```
https://cdn.jsdelivr.net/npm/dsh-reverse-switch/market/index.json
```

注意：`npmjs.com` 注册/登录页在 Cloudflare 后面，国内直连常被拦（403 / 卡在
「正在进行安全验证」）。`registry.npmjs.org` 本身是通的，所以**只要能登录成功，
发布就没问题**。jsDelivr 在国内也常常不通，走 npm 源时最好自备代理。
