import cogProtocol from './cogProtocol';
import {getCogMetadata, setReproject, setRequestHeaders} from './read/CogReader';
import locationValues from './read/locationValues';
import {colorScale, colorSchemeNames} from './render/colorScale';
import setColorFunction from './render/custom/setColorFunction';
import {clearMask, setMask} from './render/mask';
import type {Bbox, Reproject, Reprojection, ReprojectSource, TileMapping} from './types';

export type {Bbox, Reproject, Reprojection, ReprojectSource, TileMapping};
export {
  clearMask,
  cogProtocol,
  colorScale,
  colorSchemeNames,
  getCogMetadata,
  locationValues,
  setColorFunction,
  setMask,
  setReproject,
  setRequestHeaders,
};
