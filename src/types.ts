export type Layout =
  | 'image-top'
  | 'image-bottom'
  | 'image-left'
  | 'image-right';

export type Ratio = '3:4' | '4:3' | '1:1' | '9:16' | '16:9';

export type ImageFit = 'contain' | 'cover';

export type FillMode = 'solid' | 'cutout';

export type ShapeKind =
  | 'dot'
  | 'drop'
  | 'star'
  | 'heart'
  | 'music'
  | 'wave'
  | 'triangle'
  | 'hex';

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** 0–1 normalized position inside the color-block rect. */
  x: number;
  y: number;
  /** Size in color-block-rect relative units (0–1). */
  size: number;
  /** Rotation in radians. */
  rotation: number;
  /** Hex color. Only used for solid fillMode. */
  color: string;
  fillMode: FillMode;
}

export interface Caption {
  enabled: boolean;
  /** User-typed override. Empty string means "use auto". */
  text: string;
  /** Font family key (matches FONTS map in render.ts). */
  font: 'serif-italic' | 'serif' | 'sans' | 'mono';
}

export interface Composition {
  image: HTMLImageElement | null;
  imageName: string;
  /** 5 hex strings extracted via median-cut. */
  palette: string[];
  layout: Layout;
  /** Split ratio 0.25 – 0.75 (image side's share). */
  splitRatio: number;
  ratio: Ratio;
  imageFit: ImageFit;
  /** Hex color of the color block. Usually a choice from `palette`. */
  blockColor: string;
  caption: Caption;
  /** Fill mode applied to newly-added shapes. */
  activeFillMode: FillMode;
  /** Color of newly-added solid shapes (unused when fillMode = cutout). */
  activeShapeColor: string;
  shapes: Shape[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
