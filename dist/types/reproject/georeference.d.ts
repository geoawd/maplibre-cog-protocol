import type { Bbox } from '../types';
import { type Projection } from './projections';
/**
 * How a COG that is not in Web Mercator relates to it: the conversion between its CRS and
 * EPSG:3857, and the rectangle it covers in its own CRS.
 */
export type Reprojection = {
    /** E.g. "EPSG:29902". */
    crs: string;
    projection: Projection;
    /** Extent of the COG in its own CRS: [xMin, yMin, xMax, yMax]. Overviews share it. */
    extent: Bbox;
    /** The same area as [west, south, east, north] degrees. */
    geographicBbox: Bbox;
};
type GeoKeys = {
    ProjectedCSTypeGeoKey?: number;
    GeographicTypeGeoKey?: number;
} | null | undefined;
/**
 * Works out whether a COG needs reprojecting, from its GeoKeys.
 *
 * Returns undefined for Web Mercator COGs (and for COGs without a CRS, which the library has
 * always assumed to be Web Mercator): those are read as they are. Throws when the COG is in a CRS
 * that has not been registered.
 */
export declare const detectReprojection: (url: string, geoKeys: GeoKeys, extent: Bbox, rotated: boolean) => Reprojection | undefined;
/**
 * Web Mercator zoom level whose resolution matches the pixels of an image of this size, measured
 * at the middle of the COG. A pixel of the Irish Grid at 53.5ºN covers about 1.7 Web Mercator
 * metres per ground metre, so the same pixels belong to a lower zoom than a native Web Mercator
 * COG of the same pixel size would.
 */
export declare const effectiveZoom: ({ projection, extent: [xMin, yMin, xMax, yMax] }: Reprojection, width: number, height: number) => number;
export {};
