import {describe, expect, test, vi} from 'vitest';

import {detectReprojection, effectiveZoom} from '../../src/reproject/georeference';
import type {Reproject, Reprojection} from '../../src/types';

const EXTENT: [number, number, number, number] = [300000, 330000, 351200, 381200];

const reprojection: Reprojection = {
  crs: 'EPSG:29902',
  geographicBbox: [-6.5, 54.2, -5.6, 54.7],
  resolution: () => 156543.03392804097 / 2 ** 10,
  mapTile: vi.fn(),
};
const reproject = vi.fn<Reproject>(() => reprojection);

describe('detectReprojection', () => {
  test.each([[{ProjectedCSTypeGeoKey: 3857}], [{ProjectedCSTypeGeoKey: 102113}], [{}], [undefined], [null]])(
    'leaves Web Mercator (or CRS-less) COGs alone, without calling reproject: %j',
    (geoKeys) => {
      expect(detectReprojection('a.tif', geoKeys, EXTENT, false, reproject)).toBeUndefined();
      expect(reproject).not.toHaveBeenCalled();
    },
  );

  test('asks reproject about the EPSG code and extent of any other COG', () => {
    expect(detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 29902}, EXTENT, false, reproject)).toBe(reprojection);
    expect(reproject).toHaveBeenCalledWith({url: 'a.tif', epsg: 29902, extent: EXTENT});
  });

  test('prefers the projected CRS over the geographic one a projected COG also declares', () => {
    reproject.mockClear();
    detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 29902, GeographicTypeGeoKey: 4299}, EXTENT, false, reproject);
    expect(reproject).toHaveBeenCalledWith(expect.objectContaining({epsg: 29902}));
  });

  test('uses the geographic CRS of a COG that has no projected one', () => {
    reproject.mockClear();
    detectReprojection('a.tif', {GeographicTypeGeoKey: 4326}, EXTENT, false, reproject);
    expect(reproject).toHaveBeenCalledWith(expect.objectContaining({epsg: 4326}));
  });

  test('lets the error of a reproject function that does not support the CRS through', () => {
    const unsupported = vi.fn(() => {
      throw new Error('EPSG:27700 is not known');
    });
    expect(() => detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 27700}, EXTENT, false, unsupported)).toThrow(
      'EPSG:27700 is not known',
    );
  });

  test('explains that a reproject function is needed when there is none', () => {
    expect(() => detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 29902}, EXTENT, false, undefined)).toThrow(
      /a\.tif is in EPSG:29902.*setReproject\(\)/,
    );
  });

  test('rejects user-defined CRSs, which carry no EPSG code to look up', () => {
    expect(() => detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 32767}, EXTENT, false, reproject)).toThrow(
      /user-defined/,
    );
  });

  test('rejects rotated COGs, which an axis-aligned extent cannot describe', () => {
    expect(() => detectReprojection('a.tif', {ProjectedCSTypeGeoKey: 29902}, EXTENT, true, reproject)).toThrow(
      /rotated/,
    );
  });
});

describe('effectiveZoom', () => {
  test('is the Web Mercator zoom of the resolution reproject reports', () => {
    expect(effectiveZoom(reprojection, 1024, 1024)).toBeCloseTo(10, 6);
  });
});
