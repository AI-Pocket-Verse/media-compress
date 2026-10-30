import { z } from 'zod'

import { ALLOWED_OUTPUT_FORMATS } from '../config/file-types'

const RESOLUTION_PRESETS = new Set(['original', '1080p', '720p', '480p'])
const WH_RE = /^\d{1,5}x\d{1,5}$/
const BITRATE_RE = /^\d{1,7}[kKmMgG]?$/

const resolutionField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === '' ? undefined : v ?? undefined))
  .refine(
    (v) => v == null || RESOLUTION_PRESETS.has(v) || WH_RE.test(v),
    { message: 'invalid resolution' },
  )

export const CompressOptions = z.object({
  mode: z.enum(['simple', 'advanced']).default('simple'),
  quality_preset: z
    .enum(['balanced', 'smallest', 'highest', 'mobile'])
    .nullable()
    .optional()
    .default('balanced'),
  output_format: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (!v || v === 'original' || v === '') return undefined
      return v.toLowerCase().replace(/^\./, '')
    })
    .refine(
      (v) => v == null || ALLOWED_OUTPUT_FORMATS.has(v),
      { message: 'unsupported output_format' },
    ),
  resolution: resolutionField,
  custom_resolution: resolutionField,
  quality: z.number().int().min(0).max(100).nullable().optional(),
  crf: z.number().int().min(0).max(51).nullable().optional(),
  bitrate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === '' ? undefined : v ?? undefined))
    .refine((v) => v == null || BITRATE_RE.test(v), { message: 'invalid bitrate' }),
  fps: z.number().int().min(1).max(240).nullable().optional(),
  audio: z.enum(['copy', 'reencode', 'none']).nullable().optional(),
})

export type CompressOptionsT = z.infer<typeof CompressOptions>

export const Region = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
})

export type RegionT = z.infer<typeof Region>
