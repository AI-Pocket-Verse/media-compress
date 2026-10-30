import { describe, expect, it } from 'vitest'

import { buildDelogoCommand, clampRegion, type Region } from './delogo'

// The ffmpeg `delogo` filter interpolates the removed area from the surrounding
// pixels, so the logo area must leave a >=1px border on every side. Empirically
// (verified against ffmpeg 6.1 / 8.1) the accepted region must satisfy:
//   x >= 1, y >= 1, x + w <= width - 1, y + h <= height - 1
// A region touching any edge (x=0, y=0, x+w=width, y+h=height) makes ffmpeg
// fail with "Logo area is outside of the frame."
function fitsFrame(r: Region, width: number, height: number): boolean {
  return r.x >= 1 && r.y >= 1 && r.x + r.w <= width - 1 && r.y + r.h <= height - 1
}

describe('clampRegion', () => {
  const W = 1535
  const H = 2732

  it('leaves a region that is already safely inside the frame untouched', () => {
    const r = { x: 100, y: 200, w: 300, h: 150 }
    expect(clampRegion(r, W, H)).toEqual(r)
    expect(fitsFrame(clampRegion(r, W, H), W, H)).toBe(true)
  })

  it('pulls a region off the left/top edges (x=0 / y=0)', () => {
    const out = clampRegion({ x: 0, y: 0, w: 200, h: 200 }, W, H)
    expect(out.x).toBeGreaterThanOrEqual(1)
    expect(out.y).toBeGreaterThanOrEqual(1)
    expect(fitsFrame(out, W, H)).toBe(true)
  })

  it('shrinks a region flush against the bottom edge (y+h=height)', () => {
    // This is the real-world poster case: watermark at the very bottom.
    const out = clampRegion({ x: 200, y: 2632, w: 800, h: 100 }, W, H)
    expect(out.y + out.h).toBeLessThanOrEqual(H - 1)
    expect(fitsFrame(out, W, H)).toBe(true)
  })

  it('shrinks a region flush against the right edge (x+w=width)', () => {
    const out = clampRegion({ x: 1335, y: 200, w: 200, h: 100 }, W, H)
    expect(out.x + out.w).toBeLessThanOrEqual(W - 1)
    expect(fitsFrame(out, W, H)).toBe(true)
  })

  it('handles a region that fully covers the frame', () => {
    const out = clampRegion({ x: 0, y: 0, w: W, h: H }, W, H)
    expect(fitsFrame(out, W, H)).toBe(true)
  })

  it('never returns a non-positive width or height', () => {
    const out = clampRegion({ x: W, y: H, w: 10, h: 10 }, W, H)
    expect(out.w).toBeGreaterThanOrEqual(1)
    expect(out.h).toBeGreaterThanOrEqual(1)
  })
})

describe('buildDelogoCommand', () => {
  it('formats each region as a delogo filter joined by commas', () => {
    const args = buildDelogoCommand('in.png', 'out.png', [
      { x: 1, y: 2, w: 3, h: 4 },
      { x: 5, y: 6, w: 7, h: 8 },
    ])
    expect(args).toEqual([
      '-y', '-i', 'in.png',
      '-vf', 'delogo=x=1:y=2:w=3:h=4,delogo=x=5:y=6:w=7:h=8',
      '-c:a', 'copy', 'out.png',
    ])
  })
})
