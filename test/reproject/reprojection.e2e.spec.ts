import {resolve} from 'node:path';

import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import {TILE_SIZE} from '../../src/constants';
import CogReader from '../../src/read/CogReader';
import locationValues from '../../src/read/locationValues';
import {tileIndexToMercatorBbox} from '../../src/read/math';
import {getProjection} from '../../src/reproject/projections';
import type {TileIndex} from '../../src/types';
import {serveFile} from './serveFile';

/**
 * End to end, on a real COG: test/data/irish-grid-xy.tif is in EPSG:29902 (Irish Grid), 1024 x 1024
 * pixels of 50 m with two overviews, and holds in its two bands the easting (minus 300,000) and
 * northing (minus 330,000), in metres, of each of its pixels. So for any tile pixel we know exactly
 * what the reprojection must have read: the Irish Grid coordinates of that pixel's centre.
 *
 * A pixel block of the COG is noData (65535) to check that is carried through too.
 */
const FILE = resolve(__dirname, '../data/irish-grid-xy.tif');
const EXTENT = [300000, 330000, 351200, 381200];
const NODATA = 65535;

const FILE_3857 = resolve(__dirname, '../data/irish-grid-xy-3857.tif');

let url: string;
let close: () => void;
let url3857: string;
let close3857: () => void;

beforeAll(async () => {
  ({url, close} = await serveFile(FILE));
  ({url: url3857, close: close3857} = await serveFile(FILE_3857));
});

afterAll(() => {
  close();
  close3857();
});

const tileAt = (lon: number, lat: number, z: number): TileIndex => {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
};

const irishGrid = getProjection(29902)!;

/** Irish Grid coordinates the tile pixel (row, column) is expected to hold. */
const expectedEastingNorthing = (tile: TileIndex, row: number, column: number): [number, number] => {
  const [west, south, east, north] = tileIndexToMercatorBbox(tile);
  const x = west + ((column + 0.5) * (east - west)) / TILE_SIZE;
  const y = north - ((row + 0.5) * (north - south)) / TILE_SIZE;
  return irishGrid.fromWebMercator(x, y);
};

const pointInside = ([e, n]: [number, number]) => e > EXTENT[0] && e < EXTENT[2] && n > EXTENT[1] && n < EXTENT[3];

describe('COG in EPSG:29902', () => {
  test('metadata reports the CRS, geographic bounds and a Web Mercator equivalent zoom', async () => {
    const metadata = await CogReader(url).getMetadata();

    expect(metadata.crs).toBe('EPSG:29902');
    expect(metadata.noData).toBe(NODATA);

    // Reference values computed with PROJ (pyproj) from the same definition, corners of the extent
    const [west, south, east, north] = metadata.bbox!;
    expect(west).toBeCloseTo(-6.4681, 3);
    expect(south).toBeCloseTo(54.1967, 3);
    expect(east).toBeCloseTo(-5.6579, 3);
    expect(north).toBeCloseTo(54.669, 3);

    // 50 m pixels at 54.4ºN are 50 / cos(54.4º) = 85.9 m of Web Mercator: zoom 10.83, where 50 m
    // pixels at the equator would be zoom 11.6. Each overview is one zoom lower.
    const zooms = metadata.images.map((image) => image.zoom);
    expect(zooms[0]).toBeCloseTo(10.832, 2);
    expect(zooms[0] - zooms[1]).toBeCloseTo(1, 2);
    expect(zooms[1] - zooms[2]).toBeCloseTo(1, 2);
  });

  test('tilejson has the geographic bounds and a maxzoom matching the full resolution image', async () => {
    const tilejson = await CogReader(url).getTilejson(`cog://${url}`);
    expect(tilejson.maxzoom).toBe(11); // round(10.83)
    expect(tilejson.bounds![0]).toBeCloseTo(-6.4681, 3);
  });

  // The image each zoom reads (image zooms are 10.83, 9.83 and 8.83): above 11 it is the full
  // resolution one, overzoomed; 10 reads the first overview and 9 and below the second.
  test.each([
    [17, 50],
    [14, 50],
    [11, 50],
    [10, 100],
    [9, 200],
    [8, 200],
  ])('tiles at zoom %i, read from %i m pixels, hold the Irish Grid coordinates of their pixels', async (z, sourcePixel) => {
    const cog = CogReader(url);
    const {lon, lat} = (() => {
      const [lon, lat] = irishGrid.toLonLat(321000, 352000); // inside the COG, clear of the noData hole
      return {lon, lat};
    })();
    const tile = tileAt(lon, lat, z);

    const raw = await cog.getRawTile(tile);
    const {footprint} = await cog.getTileCoverage(tile);
    expect(raw).toBeInstanceOf(Uint16Array);
    expect(raw.length).toBe(TILE_SIZE * TILE_SIZE * 2);
    expect(footprint).toBeDefined();

    // Nearest neighbour sampling is off by up to half a source pixel; the mesh adds up to 0.125 tile
    // pixels (a tile pixel is this many ground metres) to that.
    const [west, , east] = tileIndexToMercatorBbox(tile);
    const groundPerTilePixel = (((east - west) / TILE_SIZE) * Math.cos((lat * Math.PI) / 180));
    const tolerance = sourcePixel / 2 + 0.125 * groundPerTilePixel * 1.5 + 1;

    let checked = 0;
    for (let row = 0; row < TILE_SIZE; row += 3) {
      for (let column = 0; column < TILE_SIZE; column += 3) {
        const i = row * TILE_SIZE + column;
        const expected = expectedEastingNorthing(tile, row, column);
        if (!pointInside(expected) || footprint![i] === 0) continue;
        if (raw[i * 2] === NODATA) continue; // the noData hole

        expect(Math.abs(raw[i * 2] + 300000 - expected[0])).toBeLessThan(tolerance);
        expect(Math.abs(raw[i * 2 + 1] + 330000 - expected[1])).toBeLessThan(tolerance);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  test('a tile on the border of the COG is only partly covered, and the rest is fill', async () => {
    const cog = CogReader(url);
    const [lon, lat] = irishGrid.toLonLat(300000, 355000); // west edge of the COG
    const tile = tileAt(lon, lat, 13);

    const raw = await cog.getRawTile(tile);
    const {footprint, left, right, top, bottom} = await cog.getTileCoverage(tile);
    expect([left, top, right, bottom]).toEqual([0, 0, TILE_SIZE, TILE_SIZE]);

    const covered = footprint!.reduce((sum, value) => sum + value, 0);
    expect(covered).toBeGreaterThan(0);
    expect(covered).toBeLessThan(TILE_SIZE * TILE_SIZE);

    // Pixels outside the COG hold the fill value, which is the COG's noData value, as for COGs
    // that need no reprojection.
    for (let i = 0; i < footprint!.length; i++) {
      if (footprint![i] === 0) {
        expect(raw[i * 2]).toBe(NODATA);
        expect(raw[i * 2 + 1]).toBe(NODATA);
      }
    }
  });

  test('the footprint follows the real edge of the COG, which is not a rectangle of the tile', async () => {
    const cog = CogReader(url);
    const [lon, lat] = irishGrid.toLonLat(300000, 355000);
    const tile = tileAt(lon, lat, 13);
    const {footprint} = await cog.getTileCoverage(tile);

    // Compare with the exact test of whether each pixel centre is in the COG
    let disagreements = 0;
    for (let row = 0; row < TILE_SIZE; row++) {
      for (let column = 0; column < TILE_SIZE; column++) {
        const inside = pointInside(expectedEastingNorthing(tile, row, column));
        if (inside !== (footprint![row * TILE_SIZE + column] === 1)) disagreements++;
      }
    }
    // Only pixels astride the border can differ
    expect(disagreements).toBeLessThan(TILE_SIZE * 0.03);
  });

  test('a tile outside the COG is empty', async () => {
    const cog = CogReader(url);
    const tile = tileAt(-6.26, 53.35, 12); // Dublin, south of the COG
    expect(await cog.getTileCoverage(tile)).toEqual({left: 0, top: 0, right: 0, bottom: 0});
  });

  test('noData pixels are preserved', async () => {
    const cog = CogReader(url);
    // The hole is rows 400-480, columns 240-360 of the full resolution image
    const hole = irishGrid.toLonLat(300000 + 300 * 50, 381200 - 440 * 50);
    const tile = tileAt(hole[0], hole[1], 15);
    const raw = await cog.getRawTile(tile);
    expect(Array.from(raw).filter((value) => value === NODATA).length).toBeGreaterThan(100);
  });

  test('locationValues reads the value of the pixel under a location', async () => {
    const [longitude, latitude] = irishGrid.toLonLat(325025, 355025);
    const values = await locationValues(url, {latitude, longitude}, 16);
    expect(Math.abs(values[0] - 25025)).toBeLessThan(40);
    expect(Math.abs(values[1] - 25025)).toBeLessThan(40);

    const outside = await locationValues(url, {latitude: 53.35, longitude: -6.26}, 16);
    expect(outside.every(Number.isNaN)).toBe(true);
  });
});

/**
 * Resampling, measured against the exact answer: every pixel of both COGs holds its own Irish Grid
 * easting (minus 300,000), a field that is exactly linear in space. Bilinear interpolation of a linear
 * field is exact, so it should be within a metre or so of the truth, while nearest neighbour is off by
 * up to half a source pixel. The 3857 COG is the same data warped by GDAL, so it is read directly.
 */
describe.each([
  ['reprojected, EPSG:29902', () => url, true],
  ['native, EPSG:3857', () => url3857, false],
])('resampling of a COG that is %s', (_, getUrl, sharesSampler) => {
  const centre = (z: number) => tileAt(...(irishGrid.toLonLat(321000, 352000) as [number, number]), z);

  /** Largest and mean error, in metres, of the easting in the pixels well inside the COG. */
  const errors = async (resampling: 'nearest' | 'bilinear', tile: TileIndex) => {
    const raw = await CogReader(getUrl()).getRawTile(tile, {resampling});
    const found: number[] = [];
    for (let row = 0; row < TILE_SIZE; row += 2) {
      for (let column = 0; column < TILE_SIZE; column += 2) {
        const [e, n] = expectedEastingNorthing(tile, row, column);
        const margin = 500; // keep clear of the border, where edge pixels are not representative
        if (!(e > EXTENT[0] + margin && e < EXTENT[2] - margin && n > EXTENT[1] + margin && n < EXTENT[3] - margin)) continue;
        const value = raw[(row * TILE_SIZE + column) * 2];
        if (value === NODATA) continue;
        found.push(Math.abs(value + 300000 - e));
      }
    }
    return {worst: Math.max(...found), mean: found.reduce((sum, value) => sum + value, 0) / found.length, count: found.length};
  };

  test('bilinear is accurate to a few metres where nearest is blocky', async () => {
    const tile = centre(14); // overzoomed: a tile pixel is about 6 ground metres, a source pixel 50 or more

    const bilinear = await errors('bilinear', tile);
    const nearest = await errors('nearest', tile);

    expect(bilinear.count).toBeGreaterThan(5000);
    expect(bilinear.worst).toBeLessThan(5);
    expect(bilinear.mean).toBeLessThan(1.5);

    expect(nearest.worst).toBeGreaterThan(15);
    expect(nearest.mean).toBeGreaterThan(5);
  });

  test('bilinear leaves the outline of the noData area as nearest has it, and never blends it into values', async () => {
    // The hole is columns 240-360, rows 400-480 of the 50 m image: eastings 312000 to 318000, northings
    // 357200 to 361200 (a little off in the warped COG). Tiles along its border straddle it, so they
    // have valid and noData pixels with an edge between them, where blending could leak.
    const tiles = new Map<string, TileIndex>();
    const along = (from: number, to: number, point: (value: number) => [number, number]) => {
      for (let value = from; value <= to; value += 200) {
        const [lon, lat] = irishGrid.toLonLat(...point(value));
        const tile = tileAt(lon, lat, 15);
        tiles.set(`${tile.x}/${tile.y}`, tile);
      }
    };
    along(357200, 361200, (n) => [312000, n]); // west edge
    along(357200, 361200, (n) => [318000, n]); // east edge
    along(312000, 318000, (e) => [e, 361200]); // north edge
    along(312000, 318000, (e) => [e, 357200]); // south edge
    const cog = CogReader(getUrl());
    const count = (raw: ArrayLike<number>) => Array.from(raw).filter((value) => value === NODATA).length;

    let straddling = 0;
    for (const tile of tiles.values()) {
      const nearest = await cog.getRawTile(tile, {resampling: 'nearest'});
      const bilinear = await cog.getRawTile(tile, {resampling: 'bilinear'});

      const holes = count(nearest) / 2; // pixels, of two samples each
      if (holes < 100 || holes > TILE_SIZE * TILE_SIZE - 100) continue; // all valid, or all noData: no edge in it
      straddling++;

      if (sharesSampler) {
        // Both methods pick pixels with the same code, so the outline is identical
        expect(count(bilinear) / 2).toBe(holes);
      } else {
        // On a Web Mercator COG nearest takes the library's direct read, which rounds the window to
        // whole source pixels and so places pixels up to about a source pixel off at strong
        // overzoom. Bilinear places them exactly. So the outlines differ by less than a source pixel
        // (171.7 Web Mercator metres in this COG) along an edge that crosses the tile
        const [west, , east] = tileIndexToMercatorBbox(tile);
        const sourcePixelInTilePixels = 171.7 / ((east - west) / TILE_SIZE);
        expect(Math.abs(count(bilinear) / 2 - holes)).toBeLessThan(TILE_SIZE * Math.ceil(sourcePixelInTilePixels));
      }
      // A pixel blended with the 65535 of the hole would land between the highest real value and noData
      expect(Array.from(bilinear).filter((value) => value > 51300 && value < NODATA)).toHaveLength(0);
    }
    expect(straddling).toBeGreaterThan(0);
  });

  test('nearest and bilinear are cached apart', async () => {
    const tile = centre(14);
    const cog = CogReader(getUrl());
    const first = await cog.getRawTile(tile, {resampling: 'bilinear'});
    const second = await cog.getRawTile(tile, {resampling: 'nearest'});
    const third = await cog.getRawTile(tile, {resampling: 'bilinear'});

    expect(Array.from(first)).not.toEqual(Array.from(second));
    expect(Array.from(third)).toEqual(Array.from(first));
  });

  test('a mask is never blended: resampling is ignored for it', async () => {
    // No mask band in these COGs: the answer is simply null, whatever resampling was asked for
    expect(await CogReader(getUrl()).getRawTile(centre(14), {mask: true})).toBeNull();
  });
});
