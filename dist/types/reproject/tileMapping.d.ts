import type { TileIndex } from '../types';
import type { Reprojection } from './georeference';
/**
 * Where each pixel of a Web Mercator tile comes from in the COG.
 *
 * Positions are fractions of the COG's extent, so they hold for the full resolution image and for
 * every overview alike: `u` runs 0 to 1 from the west to the east edge, `v` 0 to 1 from the north
 * to the south edge. They are NaN where the projection has no answer.
 */
export type TileMapping = {
    u: Float64Array;
    v: Float64Array;
    /** 1 where the pixel falls inside the COG's extent, 0 where it does not. */
    footprint: Uint8Array;
    /** [uMin, vMin, uMax, vMax] of the pixels inside the COG, or undefined if there are none. */
    bounds?: [number, number, number, number];
};
/**
 * Builds the mapping from the pixels of a Web Mercator tile to positions in a COG of another CRS.
 *
 * Projecting 65,536 pixels one by one would work but is slow, so this follows the approach of
 * deck.gl-raster: a mesh of triangles whose corners are projected exactly, and a straight
 * interpolation inside each triangle. `RasterReprojector` adds corners only where the straight
 * interpolation drifts further than `MAX_MESH_ERROR` pixels, so smooth projections like the Irish
 * Grid need a handful of triangles per tile.
 *
 * deck.gl-raster meshes the *source* image and lets the GPU draw it into the map. Without a GPU
 * the other direction is the convenient one: mesh the *tile*, treating its Web Mercator grid as
 * the "input" image and the COG's CRS as the "output", so that every tile pixel lands inside
 * exactly one triangle and none is left as a hole.
 */
export declare const buildTileMapping: (tile: TileIndex, { projection, extent, geographicBbox }: Reprojection) => TileMapping;
