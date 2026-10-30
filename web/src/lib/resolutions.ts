export interface ResolutionPreset {
  label: string
  value: string // 'WxH'
}

// 横屏常用分辨率(图片 / 视频通用)。等比适配不放大,所以应用到任意素材都安全。
export const LANDSCAPE: ResolutionPreset[] = [
  { label: '3840×2160 (4K)', value: '3840x2160' },
  { label: '2560×1440 (2K)', value: '2560x1440' },
  { label: '1920×1080 (1080P)', value: '1920x1080' },
  { label: '1600×900', value: '1600x900' },
  { label: '1280×720 (720P)', value: '1280x720' },
  { label: '854×480 (480P)', value: '854x480' },
]

// 竖屏常用分辨率(图片 / 视频通用)。
export const PORTRAIT: ResolutionPreset[] = [
  { label: '2160×3840 (4K)', value: '2160x3840' },
  { label: '1440×2560 (2K)', value: '1440x2560' },
  { label: '1080×1920 (1080P)', value: '1080x1920' },
  { label: '900×1600', value: '900x1600' },
  { label: '720×1280 (720P)', value: '720x1280' },
  { label: '480×854 (480P)', value: '480x854' },
]

// 下拉里"手动输入"项的哨兵值;选中后展示自定义 W×H 文本框。
export const MANUAL = '__manual__'

// 手动输入的合法格式(与后端 schema 的 WH_RE 对齐)。
export const RES_RE = /^\d{1,5}x\d{1,5}$/
