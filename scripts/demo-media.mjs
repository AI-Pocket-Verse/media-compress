/**
 * Records the README demo in English and Chinese:
 *
 *   pnpm demo-video → docs/screenshots/{en,zh}/demo.gif + docs/media/demo-{en,zh}.mp4
 *
 * Generates its own sample media with ffmpeg (no third-party images), builds the
 * web app, starts the real api on port 4199 with a throwaway database under
 * .tmp/demo-media/, then drives the locally installed Google Chrome with
 * Playwright. Needs ffmpeg / ffprobe on PATH and Playwright's recorder
 * (`pnpm exec playwright install ffmpeg`).
 *
 * Set PW_CHANNEL= (empty) to use Playwright's bundled Chromium instead
 * (`pnpm exec playwright install chromium`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK = join(ROOT, '.tmp/demo-media')
const MEDIA = join(WORK, 'media')
const PORT = 4199
const BASE = `http://localhost:${PORT}`
const CHANNEL = process.env.PW_CHANNEL ?? 'chrome'
const VIEWPORT = { width: 1280, height: 800 }
const REPO = 'github.com/AI-Pocket-Verse/media-compress'

// ── captions, and UI strings the script clicks (must match web/src/i18n/messages.ts) ──
const TEXT = {
  en: {
    locale: 'en-US',
    intro: {
      title: 'Media Toolbox',
      sub: 'Self-hosted image & video compression and watermark removal, powered by FFmpeg',
      lines: ['Your files stay on your own server', 'Docker or source install, no sign-up', 'English / 简体中文 UI'],
    },
    outro: {
      title: 'Get started',
      sub: 'MIT licensed · ' + REPO,
      lines: [`git clone https://${REPO}.git`, 'cd media-compress && docker compose up -d --build', 'open http://localhost:8080'],
    },
    cap: {
      drop: 'Drop in images or videos (whole folders work too)',
      preset: 'Pick a preset: App, Balanced, Smallest or High quality',
      start: 'FFmpeg compresses them in a background queue',
      compare: 'Drag the slider to compare before and after',
      zip: 'Download the whole batch as one ZIP',
      video: 'Videos work the same way',
      wmDraw: 'Remove watermarks: drag a box over the logo',
      wmSubmit: 'Submit, and the result opens for comparison',
      files: 'Files: search, preview and batch download every result',
      settings: 'Settings: language, storage usage and the exact FFmpeg commands',
    },
    ui: {
      dropTitle: 'Click to choose files, or drop files / folders here',
      presetOther: 'High quality',
      presetApp: 'App',
      start: (n) => `Start compressing (${n})`,
      compare: 'Compare',
      batchZip: (n) => `Download batch ZIP (${n})`,
      wmTab: 'Remove watermark',
      wmDropTitle: 'Click or drop a file to upload',
      wmSubmit: 'Submit',
      files: 'Files',
      search: 'Search files…',
      localUser: 'Local user',
      settings: 'Settings',
      otherLang: '简体中文',
      backToSystem: '跟随系统',
    },
  },
  zh: {
    locale: 'zh-CN',
    intro: {
      title: '媒体工具箱',
      sub: '自托管的图片 / 视频压缩与去水印工具，基于 FFmpeg',
      lines: ['文件只留在你自己的服务器上', 'Docker 或源码安装，无需注册', '中文 / English 双语界面'],
    },
    outro: {
      title: '开始使用',
      sub: 'MIT 开源协议 · ' + REPO,
      lines: [`git clone https://${REPO}.git`, 'cd media-compress && docker compose up -d --build', 'open http://localhost:8080'],
    },
    cap: {
      drop: '拖入图片或视频，也支持整个文件夹',
      preset: '选择预设：APP、均衡、最小体积、高画质',
      start: 'FFmpeg 在后台队列中逐个压缩',
      compare: '拖动滑块，对比压缩前后',
      zip: '整批结果一键打包成 ZIP 下载',
      video: '视频同样上传即压缩',
      wmDraw: '去水印：在预览图上框选水印区域',
      wmSubmit: '提交后自动弹出前后对比',
      files: '文件管理：搜索、预览、批量下载所有结果',
      settings: '设置：切换语言，查看存储用量与实际执行的 FFmpeg 命令',
    },
    ui: {
      dropTitle: '点击选择文件，或拖拽文件 / 文件夹到此',
      presetOther: '高画质',
      presetApp: 'APP',
      start: (n) => `开始压缩（${n} 个）`,
      compare: '对比',
      batchZip: (n) => `下载本批 ZIP（${n}）`,
      wmTab: '去水印',
      wmDropTitle: '点击或拖拽上传文件',
      wmSubmit: '提交任务',
      files: '文件管理',
      search: '搜索文件名…',
      localUser: '本地用户',
      settings: '设置',
      otherLang: 'English',
      backToSystem: 'System default',
    },
  },
}

// ── helpers ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} failed: ${args.join(' ')}`)
}
const ff = (args) => run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args])

/** 自制演示素材：渐变、分形和带「水印」的海报，不用任何第三方图片 */
function makeMedia() {
  if (existsSync(join(MEDIA, 'promo.mp4'))) return
  spawnSync('mkdir', ['-p', MEDIA])
  const grad = (s, colors, opts = 'speed=0') =>
    `gradients=s=${s}:${colors.map((c, i) => `c${i}=${c}`).join(':')}:n=${colors.length}:${opts}`
  ff(['-f', 'lavfi', '-i', grad('2400x1600', ['0xff7e5f', '0xfeb47b', '0x6a3093', '0x2b1055'], 'speed=0:type=radial'),
    '-vf', 'noise=alls=10:allf=u', '-frames:v', '1', '-q:v', '1', join(MEDIA, 'sunset.jpg')])
  ff(['-f', 'lavfi', '-i', 'mandelbrot=s=1600x1000:maxiter=2000', '-frames:v', '1', join(MEDIA, 'fractal.png')])
  ff(['-f', 'lavfi', '-i', grad('1920x1080', ['0x0f2027', '0x2c5364', '0x00c9a7', '0x92fe9d'], 'speed=0:type=spiral'),
    '-vf', 'noise=alls=6:allf=u', '-frames:v', '1', join(MEDIA, 'aurora.png')])
  // 海报右下角画一个半透明「LOGO」块当水印（本机 ffmpeg 不一定带 drawtext）
  ff(['-f', 'lavfi', '-i', grad('1600x1000', ['0x4568dc', '0xb06ab3', '0xffd194'], 'speed=0:type=linear'),
    '-vf', [
      'drawbox=x=1240:y=860:w=300:h=90:color=white@0.55:t=fill',
      'drawbox=x=1258:y=878:w=54:h=54:color=0x4f46e5@0.85:t=fill',
      'drawbox=x=1330:y=884:w=190:h=16:color=0x4f46e5@0.75:t=fill',
      'drawbox=x=1330:y=912:w=130:h=12:color=0x4f46e5@0.55:t=fill',
    ].join(','), '-frames:v', '1', '-q:v', '2', join(MEDIA, 'poster.jpg')])
  ff(['-f', 'lavfi', '-i', grad('1280x720', ['0x1e3c72', '0x2a5298', '0xff6a88', '0xffd194'], 'type=circular:speed=0.02:r=30'),
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-t', '6', '-vf', 'noise=alls=4:allf=t+u',
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(MEDIA, 'promo.mp4')])
}

async function waitForServer(url, ms = 30_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error(`server did not start: ${url}`)
}

/** 每种语言用一套全新的数据库和文件目录，任务队列从空开始 */
async function startApi(lang) {
  const dir = join(WORK, lang)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    HOST: '127.0.0.1',
    PORT: String(PORT),
    DATABASE_URL: `file:${join(dir, 'demo.db')}`,
    BASE_DIR: join(dir, 'data'),
    WEB_DIST_DIR: join(ROOT, 'web/dist'),
    WORKER_COUNT: '2',
    CHECKPOINT_DISABLE: '1',
  }
  const apiDir = join(ROOT, 'api')
  run('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: apiDir, env, stdio: 'ignore' })
  const proc = spawn('node', ['--import', 'tsx', 'src/index.ts'], { cwd: apiDir, env, stdio: 'ignore' })
  await waitForServer(BASE)
  return proc
}

/** 录屏里看不到系统鼠标：注入指针、字幕条和全屏标题卡 */
async function installOverlay(page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const font = 'font-family:Inter,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'
      const dot = document.createElement('div')
      dot.style.cssText =
        'position:fixed;z-index:2147483647;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;' +
        'background:rgba(99,102,241,.35);border:2px solid rgba(79,70,229,.95);pointer-events:none;transition:transform .12s;left:-50px;top:-50px'
      document.addEventListener('mousemove', (e) => {
        dot.style.left = `${e.clientX}px`
        dot.style.top = `${e.clientY}px`
      })
      document.addEventListener('mousedown', () => (dot.style.transform = 'scale(.65)'))
      document.addEventListener('mouseup', () => (dot.style.transform = 'scale(1)'))

      const cap = document.createElement('div')
      cap.style.cssText =
        `position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:86%;${font};` +
        'background:rgba(17,24,39,.88);color:#fff;font-size:22px;font-weight:600;padding:12px 26px;border-radius:14px;' +
        'box-shadow:0 8px 30px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .3s;white-space:nowrap'

      const card = document.createElement('div')
      card.style.cssText =
        `position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;align-items:center;justify-content:center;${font};` +
        'background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-align:center;opacity:0;pointer-events:none;transition:opacity .5s'

      document.body.append(card, cap, dot)
      window.__demo = {
        caption(text) {
          cap.textContent = text
          cap.style.opacity = text ? '1' : '0'
        },
        card({ title, sub, lines, code }) {
          const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
          const items = lines
            .map((l) =>
              code
                ? `<div style="font-family:ui-monospace,Menlo,monospace;font-size:22px;background:rgba(0,0,0,.28);padding:10px 22px;border-radius:10px;margin:6px 0;text-align:left;min-width:640px">$ ${esc(l)}</div>`
                : `<div style="font-size:24px;margin:8px 0;opacity:.95">✓ ${esc(l)}</div>`,
            )
            .join('')
          card.innerHTML =
            `<div style="font-size:64px;font-weight:800;letter-spacing:-.02em">${esc(title)}</div>` +
            `<div style="font-size:26px;opacity:.9;margin:14px 0 36px">${esc(sub)}</div><div>${items}</div>`
          card.style.opacity = '1'
          dot.style.opacity = '0'
        },
        hideCard() {
          card.style.opacity = '0'
          dot.style.opacity = '1'
        },
      }
    })
  })
}

const caption = (page, text) => page.evaluate((t) => window.__demo.caption(t), text)

/** 平滑移动到元素中心再点击，录屏里能看清在点哪 */
async function moveTo(page, locator, pause = 300) {
  await locator.waitFor()
  // 目标不在视口内时先平滑滚到中间，再移动指针
  const inView = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 70 && r.bottom <= innerHeight - 90
  })
  if (!inView) {
    await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await page.waitForTimeout(700)
  }
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 })
  await page.waitForTimeout(pause)
}
async function moveClick(page, locator, pause = 300) {
  await moveTo(page, locator, pause)
  await page.mouse.down()
  await page.mouse.up()
}
async function chooseFiles(page, locator, files) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), moveClick(page, locator)])
  await chooser.setFiles(files.map((f) => join(MEDIA, f)))
}

/** 在对比弹窗里左右拖动滑块，然后关闭 */
async function dragCompare(page) {
  const before = page.locator('img[alt=before]')
  await page.locator('img[alt=after]').waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('img[alt=before],img[alt=after]')].every((i) => i.complete && i.naturalWidth))
  await page.waitForTimeout(500)
  const b = await before.boundingBox()
  const y = b.y + b.height / 2
  await page.mouse.move(b.x + b.width / 2, y, { steps: 15 })
  await page.mouse.down()
  for (const p of [0.18, 0.85, 0.5]) await page.mouse.move(b.x + b.width * p, y, { steps: 28 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  await page.keyboard.press('Escape')
}

// ── recording ───────────────────────────────────────────────────────────
async function record(browser, lang) {
  const { cap, ui, intro, outro, locale } = TEXT[lang]
  const rawDir = join(WORK, `raw-${lang}`)
  await rm(rawDir, { recursive: true, force: true })
  const context = await browser.newContext({ viewport: VIEWPORT, locale, recordVideo: { dir: rawDir, size: VIEWPORT } })
  const t0 = Date.now()
  const page = await context.newPage()
  await installOverlay(page)
  await page.goto(BASE)
  await page.evaluate((c) => window.__demo.card(c), intro)
  const trim = (Date.now() - t0) / 1000 + 0.6
  await page.waitForTimeout(4200)
  await page.evaluate(() => window.__demo.hideCard())
  await page.waitForTimeout(700)

  // 1. 压缩图片：选文件 → 预设 → 开始 → 对比 → 批量 ZIP
  await caption(page, cap.drop)
  await chooseFiles(page, page.getByText(ui.dropTitle), ['sunset.jpg', 'fractal.png', 'aurora.png'])
  await page.waitForTimeout(1500)
  await caption(page, cap.preset)
  await moveClick(page, page.getByRole('button', { name: ui.presetOther, exact: true }))
  await page.waitForTimeout(500)
  await moveClick(page, page.getByRole('button', { name: ui.presetApp, exact: true }))
  await page.waitForTimeout(900)
  await caption(page, cap.start)
  await moveClick(page, page.getByRole('button', { name: ui.start(3) }))
  const compareBtns = page.getByRole('button', { name: ui.compare, exact: true })
  await page.waitForFunction(([n, label]) => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === label).length >= n, [3, ui.compare], { timeout: 60_000 })
  await page.waitForTimeout(1200)
  await caption(page, cap.compare)
  await moveClick(page, compareBtns.first())
  await dragCompare(page)
  await page.waitForTimeout(500)
  await caption(page, cap.zip)
  await moveTo(page, page.getByRole('link', { name: ui.batchZip(3) }), 1600)

  // 2. 视频
  await caption(page, cap.video)
  await chooseFiles(page, page.getByText(ui.dropTitle), ['promo.mp4'])
  await page.waitForTimeout(1000)
  await moveClick(page, page.getByRole('button', { name: ui.start(1) }))
  await page.waitForFunction(([n, label]) => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === label).length >= n, [4, ui.compare], { timeout: 120_000 })
  await page.waitForTimeout(800)
  await moveClick(page, compareBtns.first())
  await page.waitForTimeout(2600)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 3. 去水印：框选 → 提交 → 自动弹出对比
  await moveClick(page, page.getByRole('button', { name: ui.wmTab }))
  await page.waitForTimeout(600)
  await caption(page, cap.wmDraw)
  await chooseFiles(page, page.getByText(ui.wmDropTitle), ['poster.jpg'])
  const img = page.locator('img.wm-media')
  await img.waitFor()
  await page.waitForFunction(() => document.querySelector('img.wm-media')?.naturalWidth > 0)
  await page.waitForTimeout(700)
  const box = await img.boundingBox()
  const at = (x, y) => [box.x + (x / 1600) * box.width, box.y + (y / 1000) * box.height]
  await page.mouse.move(...at(1222, 842), { steps: 22 })
  await page.waitForTimeout(300)
  await page.mouse.down()
  await page.mouse.move(...at(1560, 968), { steps: 30 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  await caption(page, cap.wmSubmit)
  await moveClick(page, page.getByRole('button', { name: ui.wmSubmit }))
  await dragCompare(page)
  await page.waitForTimeout(500)

  // 4. 文件管理：搜索、勾选
  await caption(page, cap.files)
  await moveClick(page, page.getByRole('link', { name: ui.files }))
  await page.waitForTimeout(1200)
  const search = page.getByPlaceholder(ui.search)
  await moveClick(page, search, 200)
  await search.pressSequentially('sunset', { delay: 90 })
  await page.waitForTimeout(700)
  await moveClick(page, page.locator('tbody input[type=checkbox]').first())
  await page.waitForTimeout(1300)
  await search.fill('')
  await page.waitForTimeout(1200)

  // 5. 设置：切换语言再切回跟随系统
  await caption(page, cap.settings)
  await moveClick(page, page.getByRole('button', { name: ui.localUser }))
  await page.waitForTimeout(400)
  await moveClick(page, page.getByRole('menuitem', { name: ui.settings }))
  await page.waitForTimeout(1000)
  await moveClick(page, page.getByRole('button', { name: ui.otherLang, exact: true }))
  await page.waitForTimeout(1500)
  await moveClick(page, page.getByRole('button', { name: ui.backToSystem, exact: true }))
  await page.waitForTimeout(900)
  await page.mouse.wheel(0, 700)
  await page.waitForTimeout(1500)

  // 结尾卡片
  await caption(page, '')
  await page.evaluate((c) => window.__demo.card({ ...c, code: true }), outro)
  await page.waitForTimeout(4500)

  await context.close()
  const [webm] = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'))
  const src = join(rawDir, webm)

  const mediaDir = join(ROOT, 'docs/media')
  const imgDir = join(ROOT, 'docs/screenshots', lang)
  await mkdir(mediaDir, { recursive: true })
  const mp4 = join(mediaDir, `demo-${lang}.mp4`)
  const gif = join(imgDir, 'demo.gif')
  const ss = ['-ss', trim.toFixed(2)]
  ff([...ss, '-i', src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
  // GIF 从压好的 MP4 转：录屏原始 webm 的编码噪点会让 GIF 体积翻倍
  ff([
    '-i', mp4,
    '-vf', 'fps=8,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop', '0', gif,
  ])
  await rm(rawDir, { recursive: true, force: true })
  console.log(`  ✓ docs/media/demo-${lang}.mp4`)
  console.log(`  ✓ docs/screenshots/${lang}/demo.gif`)
}

// ── main ────────────────────────────────────────────────────────────────
makeMedia()
run('pnpm', ['--filter', '@media-compress/web', 'build'], { cwd: ROOT, stdio: 'ignore' })
const browser = await chromium.launch(CHANNEL ? { channel: CHANNEL } : {})
try {
  for (const lang of process.argv[2] ? [process.argv[2]] : ['en', 'zh']) {
    console.log(`demo video (${lang})…`)
    const api = await startApi(lang)
    try {
      await record(browser, lang)
    } catch (e) {
      const shot = join(WORK, `failed-${lang}.png`)
      await browser.contexts().at(-1)?.pages().at(-1)?.screenshot({ path: shot })
      console.error(`  ✗ failed, screenshot: ${shot}`)
      throw e
    } finally {
      api.kill()
    }
  }
} finally {
  await browser.close()
}
