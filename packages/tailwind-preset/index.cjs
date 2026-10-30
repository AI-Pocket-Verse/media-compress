/**
 * 共享 Tailwind preset —— token 到类名的【唯一映射点】。
 *
 * 每个 web app 只需:
 *   presets: [require('@media-compress/tailwind-preset')]
 * 并且【不再自带 colors】。规范见 docs/design-system.md §3。
 *
 * ⚠️ 颜色一律映射成 `rgb(var(--x) / <alpha-value>)` 而非 `var(--x)`。
 *    Tailwind 的 <alpha-value> 占位符要求【通道值】,写成完整色值会让 bg-accent/90
 *    这类透明度修饰符【静默失效】—— 不报错,但透明度不生效。全仓有 181 处依赖它。
 *    见 docs/design-system.md §3.1。
 *
 * 色值本身不在这里,在 @media-compress/design-tokens 的 structure.css + skins/*.css。
 * 改颜色永远只改那一个包。
 */

/**
 * 【过渡期 fallback,迁移完就整段删掉】
 *
 * 这个 preset 是 6 个 web app 的活依赖,改它等于当场改所有产品。
 * 而 CSS 变量只有【引入了 design-tokens 的 structure.css + skins/*.css】的产品才有;
 * 没引入的产品拿到的是 `var(--radius-lg)` 这种悬空引用 —— 浏览器把整条声明【直接丢弃】,
 * 表现为圆角全变直角、阴影全消失、body 没有背景色,而且 Tailwind 不会报任何错。
 *
 * 实测:auto-chat 103 处圆角 + 6 处阴影、media-compress 53 + 8、resume 42 + 3、
 * chat 24 + 0、ai-model 0 + 4,一次全废。
 *
 * 所以每个 token 都带一个 fallback,取值 = 改造【之前】那一版 preset 的值:
 *   - 没迁移的产品 → 拿 fallback → 视觉与改造前完全一致
 *   - 迁移过的产品 → 变量有定义 → 自动切到新体系
 * 这样「建设期只动 packages、应用期一个产品一个产品切」的约定才真正成立。
 *
 * 产品迁移完(index.css 都引入了 structure + skins)后,把 LEGACY 与所有 fallback 删掉。
 */
const LEGACY = {
  // 表面/文本/描边:旧 preset 是深色系(design-tokens/tailwind.cjs)
  bg: '11 13 18', // #0b0d12
  surface: '20 24 33', // #141821
  panel: '20 24 33', // 旧版无此 token,取最接近的 surface
  elevated: '20 24 33', // 同上
  fg: '230 233 239', // #e6e9ef
  'fg-muted': '154 163 178', // #9aa3b2(旧 muted)
  'fg-faint': '154 163 178', // 同上
  line: '37 43 56', // #252b38
  'line-strong': '37 43 56', // 旧版无此 token
  accent: '167 139 250', // #a78bfa
  'accent-fg': '26 18 38', // #1a1226(旧 accent.foreground)
  // 旧 preset 没有这个 token(遮罩当时是各产品写死的 bg-black/30),所以没有「改造前的值」
  // 可取;给 0 0 0 是为了让未迁移产品若用上 bg-overlay 也仍是深色遮罩,不会翻浅。
  overlay: '0 0 0',
  // 导航:旧版无这三个 token,取最接近的旧值
  'nav-active-bg': '20 24 33',
  'nav-active-fg': '230 233 239',
  'nav-group': '154 163 178',
  // 语义:旧版是【单色】,没有 bg/fg/line 三梯度,三档都回落到那一个色
  'success-bg': '16 185 129',
  'success-fg': '16 185 129',
  'success-line': '16 185 129',
  'warning-bg': '245 158 11',
  'warning-fg': '245 158 11',
  'warning-line': '245 158 11',
  'danger-bg': '239 68 68',
  'danger-fg': '239 68 68',
  'danger-line': '239 68 68',
  'info-bg': '59 130 246',
  'info-fg': '59 130 246',
  'info-line': '59 130 246',
}

/** token 名 → Tailwind 颜色值。集中一处,避免 27 个 token 各写一遍模板字符串。 */
const c = (token) => `rgb(var(--${token}, ${LEGACY[token]}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: {
        // ── 表面 ──
        bg: c('bg'),
        surface: c('surface'),
        panel: c('panel'),
        elevated: c('elevated'),
        // 弹窗遮罩。透明度在调用处给:bg-overlay/30
        overlay: c('overlay'),

        // ── 文本 ──  text-fg / text-fg-muted / text-fg-faint
        fg: {
          DEFAULT: c('fg'),
          muted: c('fg-muted'),
          faint: c('fg-faint'),
        },

        // ── 描边 ──  border-line / border-line-strong
        line: {
          DEFAULT: c('line'),
          strong: c('line-strong'),
        },

        // ── 交互 ──  bg-accent / text-accent-fg
        // 悬浮态与焦点环【不单开 token】,用透明度导出:hover:bg-accent/90、ring-accent/15
        accent: {
          DEFAULT: c('accent'),
          fg: c('accent-fg'),
        },

        // ── 导航 ──
        'nav-active-bg': c('nav-active-bg'),
        'nav-active-fg': c('nav-active-fg'),
        'nav-group': c('nav-group'),

        // ── 语义三梯度 ──  bg-danger-bg / text-danger-fg / border-danger-line
        // 这是吃掉全仓 781 处硬编码色的机制,对应调色板的 50 / 700 / 200 三档用法
        success: { bg: c('success-bg'), fg: c('success-fg'), line: c('success-line') },
        warning: { bg: c('warning-bg'), fg: c('warning-fg'), line: c('warning-line') },
        danger: { bg: c('danger-bg'), fg: c('danger-fg'), line: c('danger-line') },
        info: { bg: c('info-bg'), fg: c('info-fg'), line: c('info-line') },
      },

      // 圆角 4 档。用 extend 合并,Tailwind 自带的 full / 3xl 仍可用
      //(rounded-full 全仓 122 处,不能弄丢)。
      //
      // DEFAULT 与 2xl 【必须显式列出】:旧 preset 定义过它们(0.5rem / 1.5rem),
      // 不列的话会掉回 Tailwind 默认(0.25rem / 1rem),未迁移产品的圆角会当场变小 ——
      // 裸 rounded 与 rounded-2xl 在 auto-chat/resume/chat/media-compress 里共 71 处。
      // 迁移后它们收敛到 md / xl 两档,与「7 档收敛成 4 档」一致。
      borderRadius: {
        DEFAULT: 'var(--radius-md, 0.5rem)',
        sm: 'var(--radius-sm, 0.25rem)',
        md: 'var(--radius-md, 0.5rem)',
        lg: 'var(--radius-lg, 0.75rem)',
        xl: 'var(--radius-xl, 1rem)',
        '2xl': 'var(--radius-xl, 1.5rem)',
      },

      // 阴影 4 档,颜色走皮肤层的 --shadow-color(深色皮肤只改那一个 token)。
      // 刻意【不定义 xl/2xl】—— 应用期把产品里的 shadow-xl 收敛到 shadow-lg,
      // 否则它们会保留 Tailwind 写死的颜色,不跟随皮肤。见 docs/design-system.md §4.1。
      //
      // fallback = Tailwind 自带的同名阴影(旧 preset 只覆盖了 glass,sm/md/lg 用的就是它们)。
      // var() 的 fallback 是「第一个逗号之后的全部内容」,所以多段阴影可以整段当 fallback。
      boxShadow: {
        none: 'var(--shadow-none, 0 0 #0000)',
        sm: 'var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05))',
        md: 'var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1))',
        lg: 'var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1))',
      },

      // 字体【家族】共享;字体【大小】不定义,直接用 Tailwind 默认的 text-xs…text-2xl。
      // 重定义字号会静默改掉全仓 431 处现有写法,见 docs/design-system.md §4.1。
      fontFamily: {
        // 飞书云文档同款栈:拉丁走系统字体,中文走 PingFang SC,末尾接 emoji
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Tahoma',
          'PingFang SC', 'Microsoft Yahei', 'Arial', 'Hiragino Sans GB', 'sans-serif',
          'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji',
        ],
        // 命令、路径、URL 一律等宽,见 docs/design-system.md §5
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
