import type { TypedArray } from '../types';
import type { TileMapping } from './tileMapping';
export type SourceWindow = {
    /** [left, top, right, bottom], in pixels of the image, always inside it. */
    window: [number, number, number, number];
    /** Size of the raster to read for the window. Equal to the window unless it is decimated. */
    width: number;
    height: number;
};
/**
 * The part of an image a tile draws from, given the tile's `bounds` as fractions of the extent.
 * Undefined when the tile does not touch the image.
 */
export declare const sourceWindow: ([uMin, vMin, uMax, vMax]: [number, number, number, number], imageWidth: number, imageHeight: number) => SourceWindow | undefined;
/**
 * Builds the 256 x 256 tile from a raster read for its source window, taking for every tile pixel
 * the nearest source pixel (same as the library does for COGs that need no reprojection).
 *
 * @param raster Interleaved pixels of the window, `width * height * samples` values.
 * @param tile Where to write, interleaved, `256 * 256 * samples` values of the same type as `raster`.
 *   Pixels outside the COG are left as they are, so it should come filled with the fill value.
 */
export declare const sampleTile: ({ u, v, footprint }: TileMapping, raster: TypedArray, { window: [left, top, right, bottom], width, height }: SourceWindow, imageWidth: number, imageHeight: number, tile: TypedArray) => TypedArray;
