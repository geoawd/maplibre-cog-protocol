import {zoomFromResolution} from '../read/math';
import type {Bbox, Reproject, Reprojection} from '../types';

type GeoKeys = {ProjectedCSTypeGeoKey?: number; GeographicTypeGeoKey?: number} | null | undefined;

/** EPSG codes of Web Mercator, which the library reads natively, without reprojecting. */
const WEB_MERCATOR_CODES: ReadonlyArray<number> = [3857, 102113];

const USER_DEFINED = 32767;

/**
 * Works out whether a COG needs reprojecting, from its GeoKeys, and if so asks `reproject` how.
 *
 * Returns undefined for Web Mercator COGs (and for COGs without a CRS, which the library has
 * always assumed to be Web Mercator): those are read as they are. Throws when the COG is in another
 * CRS and there is no `reproject` function, or it does not support the CRS.
 */
export const detectReprojection = (
  url: string,
  geoKeys: GeoKeys,
  extent: Bbox,
  rotated: boolean,
  reproject: Reproject | undefined,
): Reprojection | undefined => {
  const projected = geoKeys?.ProjectedCSTypeGeoKey;
  const epsg = projected !== undefined ? projected : geoKeys?.GeographicTypeGeoKey;

  if (epsg === undefined || WEB_MERCATOR_CODES.includes(epsg)) return undefined;

  if (epsg === USER_DEFINED) {
    throw new Error(
      `COG ${url} uses a user-defined CRS, which is not supported. Reproject it to an EPSG-coded CRS or to EPSG:3857.`,
    );
  }

  if (reproject === undefined) {
    throw new Error(
      `COG ${url} is in EPSG:${epsg}, not in EPSG:3857 (Web Mercator), and no reprojection is set up. Reproject the COG to EPSG:3857, or call setReproject() with a reproject function such as the one in @geomatico/maplibre-cog-reproject.`,
    );
  }

  const reprojection = reproject({url, epsg, extent});

  if (rotated) {
    throw new Error(`COG ${url} is rotated or sheared, which is not supported. Reproject it to a north-up CRS.`);
  }

  return reprojection;
};

/**
 * Web Mercator zoom level whose resolution matches the pixels of an image of this size. A pixel of
 * the Irish Grid at 53.5ºN covers about 1.7 Web Mercator metres per ground metre, so the same
 * pixels belong to a lower zoom than a native Web Mercator COG of the same pixel size would.
 */
export const effectiveZoom = ({resolution}: Reprojection, width: number, height: number): number =>
  zoomFromResolution(resolution(width, height));
