import {TILE_SIZE} from '../constants';
import type {TypedArray} from '../types';
import type {TileMapping} from './tileMapping';

/** A window larger than this, in pixels per side, is read decimated: the tile only has 256. */
const MAX_READ_SIZE = 1024;

export type SourceWindow = {
  /** [left, top, right, bottom], in pixels of the image, always inside it. */
  window: [number, number, number, number];
  /** Size of the raster to read for the window. Equal to the window unless it is decimated. */
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The part of an image a tile draws from, given the tile's `bounds` as fractions of the extent.
 * Undefined when the tile does not touch the image.
 */
export const sourceWindow = (
  [uMin, vMin, uMax, vMax]: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): SourceWindow | undefined => {
  // One pixel of margin, so rounding never leaves the last row or column of the tile short
  const left = clamp(Math.floor(uMin * imageWidth) - 1, 0, imageWidth);
  const right = clamp(Math.ceil(uMax * imageWidth) + 1, 0, imageWidth);
  const top = clamp(Math.floor(vMin * imageHeight) - 1, 0, imageHeight);
  const bottom = clamp(Math.ceil(vMax * imageHeight) + 1, 0, imageHeight);
  if (right <= left || bottom <= top) return undefined;

  const decimation = Math.max(1, Math.ceil(Math.max(right - left, bottom - top) / MAX_READ_SIZE));
  return {
    window: [left, top, right, bottom],
    width: Math.ceil((right - left) / decimation),
    height: Math.ceil((bottom - top) / decimation),
  };
};

/**
 * How the pixels of a tile are taken from the source image:
 * - `nearest`: the single closest source pixel. Values are never altered, but pixels show as blocks
 *   when the source is coarser than the tile. The right choice for classes and categories.
 * - `bilinear`: a blend of the four closest source pixels. Smooth, and the right choice for
 *   continuous data such as elevation, where blocks turn into stair-stepped hillshade.
 */
export type Resampling = 'nearest' | 'bilinear';

export const isResampling = (value: string): value is Resampling => value === 'nearest' || value === 'bilinear';

/**
 * Builds the 256 x 256 tile from a raster read for its source window.
 *
 * Bilinear sampling never blends noData into a value: a source pixel that is noData (or not a finite
 * number) takes no part in the average, and a pixel whose own nearest source pixel is noData stays
 * noData. So the outline of the data is exactly what `nearest` gives, only its values are smoothed.
 *
 * @param raster Interleaved pixels of the window, `width * height * samples` values.
 * @param tile Where to write, interleaved, `256 * 256 * samples` values of the same type as `raster`.
 *   Pixels outside the COG are left as they are, so it should come filled with the fill value.
 * @param noData The COG's noData value, if it has one.
 */
export const sampleTile = (
  {u, v, footprint}: TileMapping,
  raster: TypedArray,
  {window: [left, top, right, bottom], width, height}: SourceWindow,
  imageWidth: number,
  imageHeight: number,
  tile: TypedArray,
  resampling: Resampling = 'nearest',
  noData?: number,
): TypedArray => {
  const samples = tile.length / (TILE_SIZE * TILE_SIZE);
  const ratioX = (right - left) / width; // 1, unless the window was decimated
  const ratioY = (bottom - top) / height;
  const isFloat = tile instanceof Float32Array || tile instanceof Float64Array;

  const isValid = (value: number) => Number.isFinite(value) && value !== noData;

  for (let i = 0; i < footprint.length; i++) {
    if (footprint[i] === 0) continue;

    // Position in the read raster, in pixels, where pixel c covers [c, c + 1)
    const x = (u[i] * imageWidth - left) / ratioX;
    const y = (v[i] * imageHeight - top) / ratioY;

    const nearestColumn = clamp(Math.floor(x), 0, width - 1);
    const nearestRow = clamp(Math.floor(y), 0, height - 1);
    const nearest = (nearestRow * width + nearestColumn) * samples;
    const to = i * samples;

    if (resampling === 'nearest') {
      for (let sample = 0; sample < samples; sample++) tile[to + sample] = raster[nearest + sample];
      continue;
    }

    // Pixel centres are at c + 0.5, so the four pixels around (x, y) start half a pixel back
    const fx = x - 0.5;
    const fy = y - 0.5;
    const column0 = Math.floor(fx);
    const row0 = Math.floor(fy);
    const tx = fx - column0;
    const ty = fy - row0;

    const columnA = clamp(column0, 0, width - 1); // clamped: the edge pixel repeats beyond the image
    const columnB = clamp(column0 + 1, 0, width - 1);
    const rowA = clamp(row0, 0, height - 1);
    const rowB = clamp(row0 + 1, 0, height - 1);

    const topLeft = (rowA * width + columnA) * samples;
    const topRight = (rowA * width + columnB) * samples;
    const bottomLeft = (rowB * width + columnA) * samples;
    const bottomRight = (rowB * width + columnB) * samples;

    const weightTopLeft = (1 - tx) * (1 - ty);
    const weightTopRight = tx * (1 - ty);
    const weightBottomLeft = (1 - tx) * ty;
    const weightBottomRight = tx * ty;

    for (let sample = 0; sample < samples; sample++) {
      const own = raster[nearest + sample];
      if (!isValid(own)) {
        tile[to + sample] = own; // keep the outline of the data exactly as nearest has it
        continue;
      }

      let sum = 0;
      let weights = 0;
      let value = raster[topLeft + sample];
      if (isValid(value)) {
        sum += value * weightTopLeft;
        weights += weightTopLeft;
      }
      value = raster[topRight + sample];
      if (isValid(value)) {
        sum += value * weightTopRight;
        weights += weightTopRight;
      }
      value = raster[bottomLeft + sample];
      if (isValid(value)) {
        sum += value * weightBottomLeft;
        weights += weightBottomLeft;
      }
      value = raster[bottomRight + sample];
      if (isValid(value)) {
        sum += value * weightBottomRight;
        weights += weightBottomRight;
      }

      // weights is 0 only if the four pixels around are all noData, but the nearest one is not (it
      // is one of the four, or an edge pixel they repeat): that cannot happen, but don't divide by 0.
      const result = weights > 0 ? sum / weights : own;
      tile[to + sample] = isFloat ? result : Math.round(result);
    }
  }
  return tile;
};
