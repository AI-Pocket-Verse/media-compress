import path from 'node:path'

import { env } from '../env'
import { probeFile } from '../utils/probe'

import { removePartialOutput, runFfmpeg } from './compressor'

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Clamp a logo region so ffmpeg's `delogo` filter accepts it.
 *
 * `delogo` interpolates the removed area from the pixels immediately around it,
 * so it requires a >=1px border on every side. Empirically the region must
 * satisfy: x >= 1, y >= 1, x + w <= width - 1, y + h <= height - 1. A region
 * that touches any edge (x=0, y=0, x+w=width, y+h=height) makes the filter
 * fail with "Logo area is outside of the frame." We pull the region inside that
 * 1px border, losing at most a sliver of an edge-aligned watermark.
 */
export function clampRegion(r: Region, width: number, height: number): Region {
  // Largest valid top-left that still leaves room for a 1px region + borders.
  const maxX = Math.max(1, width - 2)
  const maxY = Math.max(1, height - 2)
  const x = Math.min(Math.max(1, Math.round(r.x)), maxX)
  const y = Math.min(Math.max(1, Math.round(r.y)), maxY)
  const w = Math.max(1, Math.min(Math.round(r.w), width - 1 - x))
  const h = Math.max(1, Math.min(Math.round(r.h), height - 1 - y))
  return { x, y, w, h }
}

export function buildDelogoCommand(input: string, output: string, regions: Region[]): string[] {
  const filters = regions.map((r) => `delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}`).join(',')
  return ['-y', '-i', input, '-vf', filters, '-c:a', 'copy', output]
}

function outputFilename(taskId: string, original: string): string {
  const stem = path.basename(original, path.extname(original))
  const ext = path.extname(original).toLowerCase()
  return `${taskId.slice(0, 8)}_${stem}_delogo${ext}`
}

export async function removeWatermark(
  inputPath: string,
  regions: Region[],
  taskId: string,
  originalFilename: string,
  dims?: { width?: number | null; height?: number | null },
): Promise<string> {
  const outName = outputFilename(taskId, originalFilename)
  const outPath = path.join(env.OUTPUT_DIR, outName)

  // delogo rejects any region touching a frame edge, so clamp every region into
  // the frame's 1px interpolation border. We need the real dimensions to do
  // that — prefer the ones probed at upload time, otherwise probe now.
  let { width, height } = dims ?? {}
  if (!width || !height) {
    const meta = await probeFile(inputPath)
    width = meta?.video?.width ?? width
    height = meta?.video?.height ?? height
  }

  const safeRegions = width && height
    ? regions.map((r) => clampRegion(r, width!, height!))
    : regions

  const args = buildDelogoCommand(inputPath, outPath, safeRegions)
  try {
    await runFfmpeg(args, env.FFMPEG_TIMEOUT_MS)
  } catch (e) {
    await removePartialOutput(outPath)
    throw e
  }
  return outPath
}
