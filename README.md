# dsh-reverse-switch

A sidebar entry for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that turns **both** reverse-engineering MCP backends on or off with one click:

| Backend | Tools once enabled | Size |
|---|---|---|
| [REA](https://www.npmjs.com/package/rea-agents) (`rea-agents` 6.4.0) | `mcp__rea__*` | 170 tools + 6 prompts |
| [Craft Anything](https://github.com/storytold/craft-anything) (`craft-anything-cli` 0.5.0) | `mcp__craft-anything__*` | 36 essentials, ~300 more via `enable_toolset` |

Both are registered as `disabled: true` MCP client entries, so a machine that is not reverse engineering pays neither context nor permission surface. Clicking **逆向 / Reverse** in the sidebar flips the `disabled` fields in the profile patch; DSH's own HMR reloads them and the tools appear on the next turn. No restart.

中文说明见 [README.zh.md](./README.zh.md)。

## How it works

- **Host half** (`lib/index.js`) — `inject: ['webServer']`, registers `/plugins/dsh-reverse-switch/{status,toggle}`. Toggling does a **line-level** edit of `disabled:` inside the two `@deepseek-ai/dsh-mcp-client` entries of `~/.dsh/profiles/<name>/cordis.patch.yml` — never a YAML round-trip, because those files are hand-commented. Entries are re-created (with a commented `- insert:` block) if missing, so the switch self-heals in another profile.
- **Browser half** (`lib/client.js`) — hand-written classic script registered through `window.__ModuleLoader__.load`, no build step, no JSX. It fills `sidebar.panellist` (the entry) and `main` (the panel).

## Paths are configurable

Backend launch commands live in the `ENTRIES` constant at the top of `lib/index.js`. Defaults match a Windows box with:

```
E:\node.exe
C:\Users\%USERNAME%\AppData\Roaming\npm\node_modules\rea-agents\dist\cli.js
E:\wb\craft-anything\craft-anything-0.5.0-windows-x64-portable\craft-anything-cli.exe
```

Edit those three strings for your layout. Craft Anything is started with `--deep --project <a .cany folder>`: Deep mode is what lets it read a target's code and files.

## Plugin market

This package ships its own format‑1 market index at `market/index.json`:

```
https://cdn.jsdelivr.net/npm/dsh-reverse-switch/market/index.json
```

Add it in **Plugins → 发现 (Discover) → 索引源 (Index sources)**.

## License

MIT
