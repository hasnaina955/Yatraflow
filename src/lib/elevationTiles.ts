// ============ Elevation tiles: fetch and decode a Terrarium PNG ============
// The browser half of `elevation.ts`. It fetches one tile from the same
// keyless AWS Terrain Tiles bucket the Map tab's terrain mode uses, and turns
// the PNG into the RGBA bytes the sampler reads.
//
// The bucket sends `Access-Control-Allow-Origin: *`, so a plain `fetch` plus a
// blob decode is enough — no proxy, no key, no tainted canvas.
import {
  ELEVATION_TILE_URL,
  type ElevationTile,
  type ElevationTileKey,
  type ElevationTileLoader,
} from './elevation'

/** Test seam. Production never calls the setter, so the shipped path is the real fetch. */
let overrideLoader: ElevationTileLoader | null = null

export function setElevationTileLoaderForTests(loader: ElevationTileLoader | null): void {
  // Dev and test only. A production bundle must never swap the loader.
  if (!import.meta.env.DEV) return
  overrideLoader = loader
}

export function activeElevationTileLoader(): ElevationTileLoader {
  return overrideLoader ?? terrariumTileLoader
}

export function elevationTileUrl(key: ElevationTileKey): string {
  return ELEVATION_TILE_URL
    .replace('{z}', String(key.z))
    .replace('{x}', String(key.x))
    .replace('{y}', String(key.y))
}

export const terrariumTileLoader: ElevationTileLoader = async (key, signal) => {
  const response = await fetch(elevationTileUrl(key), { signal, mode: 'cors' })
  if (!response.ok) throw new Error(`elevation tile ${response.status}`)
  const blob = await response.blob()
  return decodeElevationTile(blob)
}

/** Decode a PNG blob into raw RGBA. Throws when the platform cannot decode. */
export async function decodeElevationTile(blob: Blob): Promise<ElevationTile> {
  if (typeof createImageBitmap !== 'function') throw new Error('no image decoder')
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.width, bitmap.height)
      : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
    const context = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!context) throw new Error('no 2d context')
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return { size: bitmap.width, rgba: image.data }
  } finally {
    bitmap.close?.()
  }
}
