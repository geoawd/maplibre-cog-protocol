import type { Bbox } from '../types';
/** EPSG codes the library reads natively, without reprojecting. */
export declare const WEB_MERCATOR_CODES: ReadonlyArray<number>;
/**
 * Teach the library a CRS it does not know, so COGs using it can be reprojected.
 *
 * @param epsg EPSG code, as stored in the COG's GeoKeys (e.g. 27700).
 * @param definition A proj4 string or a WKT string.
 */
export declare const registerProjection: (epsg: number, definition: string) => void;
/** A coordinate conversion between a COG's CRS and Web Mercator (EPSG:3857). */
export type Projection = {
    /** Source CRS to EPSG:3857 metres. */
    toWebMercator: (x: number, y: number) => [number, number];
    /** EPSG:3857 metres to source CRS. */
    fromWebMercator: (x: number, y: number) => [number, number];
    /** Source CRS to [longitude, latitude] degrees. */
    toLonLat: (x: number, y: number) => [number, number];
};
/**
 * The conversion for an EPSG code, or undefined when the CRS is not known.
 *
 * It goes through WGS84 longitude/latitude, so the CRS's datum shift is applied by proj4, and
 * Web Mercator is the spherical formula applied on top. That is also what EPSG:3857 means.
 */
export declare const getProjection: (epsg: number) => Projection | undefined;
/** Geographic bounding box [west, south, east, north] of a rectangle given in the source CRS. */
export declare const extentToGeographicBbox: (projection: Projection, [xMin, yMin, xMax, yMax]: Bbox) => Bbox;
