export type Layout =
  | 'image-top'
  | 'image-bottom'
  | 'image-left'
  | 'image-right';

export type FillMode = 'solid' | 'cutout';

export type ShapeKind =
  | 'dot'
  | 'drop'
  | 'star'
  | 'heart'
  | 'music'
  | 'wave'
  | 'triangle'
  | 'hex'
  | 'text';

export type FontKey = 'serif-italic' | 'serif' | 'sans' | 'mono';

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** 0–1 normalized position inside the color-block rect. */
  x: number;
  y: number;
  /** Size in color-block-rect relative units (0–0.3 typical range). */
  size: number;
  /** Rotation in radians. */
  rotation: number;
  /** Hex color. Only used for solid fillMode. */
  color: string;
  fillMode: FillMode;
  /** Literal text payload for kind==='text'. Ignored otherwise. */
  text?: string;
  /** Font family key for kind==='text'. Ignored otherwise. */
  font?: FontKey;
}

export interface Caption {
  enabled: boolean;
  /** User-typed override. Empty string means "use auto". */
  text: string;
  /** Font family key (matches FONTS map in render.ts). */
  font: FontKey;
}

export interface Composition {
  image: HTMLImageElement | null;
  imageName: string;
  /** 5 hex strings extracted via median-cut. */
  palette: string[];
  layout: Layout;
  /** Hex color of the color block. Usually a choice from `palette`. */
  blockColor: string;
  caption: Caption;
  /** Fill mode applied to newly-added shapes. */
  activeFillMode: FillMode;
  /** Color of newly-added solid shapes (unused when fillMode = cutout). */
  activeShapeColor: string;
  /** Size of newly-added shapes (in color-block relative units, 0.04–0.3). */
  activeShapeSize: number;
  /** Pending text string to place when user presses "Add text". */
  activeShapeText: string;
  shapes: Shape[];
  /** Currently selected shape id, null if nothing selected. */
  selectedShapeId: string | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
