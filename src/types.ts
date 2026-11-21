export type TileJSON = {
  tilejson: '2.2.0';
  tiles: Array<string>;
  name?: string;
  description?: string;
  version?: string;
  attribution?: string;
  template?: string;
  legend?: string;
  scheme?: string;
  grids?: Array<string>;
  data?: Array<string>;
  minzoom: number;
  maxzoom: number;
  bounds?: Array<number>;
  center?: Array<number>;
};

export type TileIndex = {
  z: number;
  x: number;
  y: number;
};

export type Bbox = [number, number, number, number];

/**
 * Where each pixel of a 256 x 256 Web Mercator tile comes from in a COG of another CRS, row by row.
 *
 * Positions are fractions of the COG's extent, so they hold for the full resolution image and for
 * every overview alike: `u` runs 0 to 1 from the west to the east edge, `v` 0 to 1 from the north
 * to the south edge. They are NaN where the CRS has no answer.
 */
export type TileMapping = {
  u: Float64Array;
  v: Float64Array;
  /** 1 where the pixel falls inside the COG's extent, 0 where it does not. */
  footprint: Uint8Array;
  /** [uMin, vMin, uMax, vMax] of the pixels inside the COG, or undefined if there are none. */
  bounds?: [number, number, number, number];
};

/** What a COG that needs reprojecting is known by. */
export type ReprojectSource = {
  url: string;
  /** EPSG code of the COG's CRS, from its GeoKeys. */
  epsg: number;
  /** Extent of the COG in its own CRS: [xMin, yMin, xMax, yMax]. Overviews share it. */
  extent: Bbox;
};

/** How a COG in another CRS relates to Web Mercator. Returned by a {@link Reproject} function. */
export type Reprojection = {
  /** E.g. "EPSG:29902". Reported as `crs` in the COG's metadata. */
  crs: string;
  /** The extent as [west, south, east, north] degrees. */
  geographicBbox: Bbox;
  /**
   * Web Mercator metres per pixel of an image of this size covering the whole extent, measured at its
   * middle. Used to pick the overview to read for a zoom level.
   */
  resolution: (imageWidth: number, imageHeight: number) => number;
  /** The mapping for a tile, given its Web Mercator bounds: [west, south, east, north] metres. */
  mapTile: (mercatorBbox: Bbox) => TileMapping;
};

/**
 * Hook that gives the reader the means to reproject COGs that are not in Web Mercator. It is called
 * once per COG, and must throw if it does not support the CRS.
 */
export type Reproject = (source: ReprojectSource) => Reprojection;

/**
 * The part of a tile that is actually covered by the COG, as a half-open rectangle of tile pixels:
 * columns [left, right) and rows [top, bottom). Pixels outside it have no source pixel at all.
 */
export type TileCoverage = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /**
   * Only for COGs that had to be reprojected, whose border is not aligned with the tile grid: one
   * entry per tile pixel (row by row), 1 if it has a source pixel and 0 if not.
   */
  footprint?: Uint8Array;
};

export type CogMetadata = {
  offset: number;
  scale: number;
  noData?: number;
  photometricInterpretation?: number;
  bitsPerSample?: Array<number>;
  colorMap?: Array<number>;
  /** Index of the sample holding alpha, when the COG declares one in ExtraSamples. */
  alphaBand?: number;
  /** Whether that alpha is associated (TIFF ExtraSamples 1), i.e. the colors are premultiplied. */
  premultipliedAlpha?: boolean;
  artist?: string;
  /** CRS of the COG, such as "EPSG:29902", when it is not Web Mercator and gets reprojected. */
  crs?: string;
  bbox?: Bbox;
  images: Array<ImageMetadata>;
};

export type ImageMetadata = {
  zoom: number;
  isOverview: boolean;
  isMask: boolean;
};

export type TypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export type ImageRenderer<T extends object> = (data: TypedArray, options: T) => Uint8ClampedArray<ArrayBuffer>;

export type Location = {
  latitude: number;
  longitude: number;
};

export type LatLonZoom = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type TilePixel = {
  tileIndex: TileIndex;
  row: number;
  column: number;
};

type RGBAValue = Uint8ClampedArray;
export type ColorFunction = (pixel: TypedArray, color: RGBAValue, metadata: CogMetadata) => void;
