/**
 * Browser half of dsh-reverse-switch.
 *
 * 手写 classic-script 包（无构建步骤）：host 从 `exports["./client"]` 送出这个文件，
 * 期望 `window.__ModuleLoader__.load`，`id` 等于包名。`react` 由 require() 提供，
 * 因此没有 JSX，全部用 React.createElement。
 *
 * 槽位：
 *  | `sidebar.panellist` | 左侧栏「逆向」入口（与 插件 / 自动化任务 / Purge / 记忆 同排）|
 *  | `main`              | 该入口对应的主面板：两个 MCP 后端的开关 |
 *
 * 开关真身在 host 半侧：读改写 profile patch 里 `disabled:` 字段，落盘即触发 HMR。
 */
window.__ModuleLoader__.load({
  id: 'dsh-reverse-switch',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const NS = 'reverseMode'
    const PANEL_ID = 'reverse-switch'
    const BASE = '/plugins/dsh-reverse-switch'
    const inject = ['slots', 'locale']

    const zh = {
      panel: '逆向',
      title: '逆向模式',
      subtitle: '一键同时启用 REA 与 Craft Anything 两套逆向 MCP 工具链；默认关闭，省上下文与权限面。',
      on: '已开启',
      off: '已关闭',
      mixed: '部分开启',
      enable: '开启逆向模式',
      disable: '关闭逆向模式',
      working: '写入配置中…',
      reloading: '重载中…',
      reloadTimeout: '重载后一直没有响应，稍后点「刷新状态」，或重启 DSH。',
      reloadNote: '写入后 DSH 会热重载该条目，MCP 连接需要几秒重建，工具随下一轮出现。',
      missing: '未配置',
      refresh: '刷新状态',
      error: '出错了',
      tools: '工具前缀',
      files: '配置文件',
    }

    const en = {
      panel: 'Reverse',
      title: 'Reverse mode',
      subtitle: 'Turn on both reverse-engineering MCP backends (REA + Craft Anything) at once. Off by default to save context and permissions.',
      on: 'On',
      off: 'Off',
      mixed: 'Partly on',
      enable: 'Turn on reverse mode',
      disable: 'Turn off reverse mode',
      working: 'Writing config…',
      reloading: 'Reloading…',
      reloadTimeout: 'No response after reload. Press Refresh in a moment, or restart DSH.',
      reloadNote: 'DSH hot-reloads these entries; the MCP connections need a few seconds and the tools appear next turn.',
      missing: 'not configured',
      refresh: 'Refresh',
      error: 'Failed',
      tools: 'Tool prefix',
      files: 'Config files',
    }

    const S = {
      page: {
        padding: '28px 32px 48px',
        maxWidth: '860px',
        margin: '0 0 0 0',
        fontFamily: 'inherit',
        color: 'inherit',
      },
      h1: { fontSize: '20px', fontWeight: 600, margin: '0 0 6px' },
      sub: { fontSize: '13px', opacity: 0.66, margin: '0 0 22px', lineHeight: 1.6 },
      badge: (tone) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: '999px',
        color: tone === 'on' ? '#0a7d45' : tone === 'mixed' ? '#8a5a00' : 'rgba(120,120,120,0.95)',
        background: tone === 'on' ? 'rgba(16,163,90,0.12)' : tone === 'mixed' ? 'rgba(200,150,0,0.14)' : 'rgba(120,120,120,0.10)',
      }),
      card: {
        border: '1px solid rgba(120,120,120,0.22)',
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        background: 'rgba(120,120,120,0.03)',
      },
      dot: (on) => ({
        width: '9px',
        height: '9px',
        borderRadius: '999px',
        marginTop: '6px',
        flex: '0 0 auto',
        background: on ? '#10a35a' : 'rgba(140,140,140,0.55)',
        boxShadow: on ? '0 0 0 3px rgba(16,163,90,0.16)' : 'none',
      }),
      cardTitle: { fontSize: '14px', fontWeight: 600, marginBottom: '3px' },
      cardHint: { fontSize: '12px', opacity: 0.62, lineHeight: 1.55 },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '11.5px',
        padding: '1px 6px',
        borderRadius: '5px',
        background: 'rgba(120,120,120,0.12)',
      },
      button: (primary, disabled) => ({
        appearance: 'none',
        border: primary ? 'none' : '1px solid rgba(120,120,120,0.30)',
        borderRadius: '9px',
        padding: '9px 18px',
        fontSize: '13.5px',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        color: primary ? '#fff' : 'inherit',
        background: primary ? '#2b6cf6' : 'transparent',
        marginRight: '8px',
      }),
      note: { fontSize: '12px', opacity: 0.55, marginTop: '16px', lineHeight: 1.65 },
      err: {
        marginTop: '12px',
        fontSize: '12.5px',
        color: '#c0392b',
        background: 'rgba(192,57,43,0.08)',
        border: '1px solid rgba(192,57,43,0.22)',
        borderRadius: '8px',
        padding: '9px 12px',
        whiteSpace: 'pre-wrap',
      },
    }

    function face() {
      return {
        status: async () => {
          const response = await fetch(`${BASE}/status`, { headers: { 'cache-control': 'no-store' } })
          if (!response.ok) throw new Error(`status HTTP ${String(response.status)}`)
          return await response.json()
        },
        toggle: async (mode) => {
          const response = await fetch(`${BASE}/toggle`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode }),
          })
          const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${String(response.status)}` }))
          if (!response.ok || data.ok === false) throw new Error(data.error ?? `HTTP ${String(response.status)}`)
          return data
        },
      }
    }

    function Panel({ t, status, toggle }) {
      const [data, setData] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      // 每次写盘都会让 DSH 重新组合整个 profile，重载的那一两秒里本插件自己的
      // 路由也会被拆掉，任何 fetch 都会拿到 404/405 或直接连不上。这个状态就是
      // 用来熬过重载窗口的：期间显示「重载中」，轮询到路由回来为止。
      const [settling, setSettling] = React.useState(false)

      const settle = React.useCallback(async () => {
        setSettling(true)
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 900 : 1200))
          try {
            const next = await status()
            if (next && next.ok !== false) {
              setData(next)
              setError(null)
              setSettling(false)
              return
            }
          } catch {
            // 重载窗口里失败是预期的，继续等
          }
        }
        setSettling(false)
        setError(t('reloadTimeout'))
      }, [status, t])

      React.useEffect(() => {
        void settle()
      }, [settle])

      const onToggle = async () => {
        const next = data !== null && data.enabled ? 'off' : 'on'
        setBusy(true)
        setError(null)
        try {
          const result = await toggle(next)
          if (result !== null && typeof result === 'object') setData(result)
        } catch {
          // 写盘已经发生，重载把响应打断是正常的；交给 settle 去确认最终状态
        } finally {
          setBusy(false)
          void settle()
        }
      }

      const mode = data === null ? null : data.mode
      const tone = mode === 'on' ? 'on' : mode === 'mixed' ? 'mixed' : 'off'
      const label = settling ? t('reloading') : mode === 'on' ? t('on') : mode === 'mixed' ? t('mixed') : t('off')
      const targets = data === null ? [] : data.targets ?? []

      return h(
        'div',
        { style: S.page },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' } },
          h('h1', { style: S.h1 }, t('title')),
          h('span', { style: S.badge(tone) }, label),
        ),
        h('div', { style: S.sub }, t('subtitle')),
        ...targets.map((row) =>
          h(
            'div',
            { key: row.key, style: S.card },
            h('span', { style: S.dot(row.enabled) }),
            h(
              'div',
              { style: { flex: '1 1 auto' } },
              h('div', { style: S.cardTitle }, row.label),
              h(
                'div',
                { style: S.cardHint },
                row.hint,
                ' · ',
                t('tools'),
                ' ',
                h('code', { style: S.code }, `${row.prefix}*`),
                row.exists ? '' : ` · ${t('missing')}`,
              ),
            ),
          ),
        ),
        h(
          'div',
          { style: { marginTop: '20px' } },
          h(
            'button',
            {
              type: 'button',
              style: S.button(true, busy),
              disabled: busy,
              onClick: () => {
                void onToggle()
              },
            },
            busy ? t('working') : data !== null && data.enabled ? t('disable') : t('enable'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: S.button(false, busy),
              disabled: busy,
              onClick: () => {
                void settle()
              },
            },
            t('refresh'),
          ),
        ),
        error === null ? null : h('div', { style: S.err }, `${t('error')}: ${error}`),
        h('div', { style: S.note }, t('reloadNote')),
        data !== null && Array.isArray(data.files)
          ? h('div', { style: S.note }, `${t('files')}: ${data.files.join(' · ')}`)
          : null,
      )
    }

    function PanelIcon() {
      return h('span', { 'aria-hidden': true, style: { fontSize: '15px', lineHeight: 1 } }, '\u{1F52C}')
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-reverse-switch: dictionaries')
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: () => face(),
          },
          Panel,
        ),
      )
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 55,
            label: () => t('panel'),
            locale: NS,
          },
          PanelIcon,
        ),
      )
    }

    exports.NS = NS
    exports.PANEL_ID = PANEL_ID
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
