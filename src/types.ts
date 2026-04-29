export type Layout =
  | 'image-top'
  | 'image-bottom'
  | 'image-left'
  | 'image-right';

/** Target canvas aspect ratio. 'auto' = natural photo + block (legacy behaviour). */
export type CanvasRatio = 'auto' | '1:1' | '4:3' | '3:4' | '9:16' | '16:9';

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

// ── Color block fill types ──────────────────────────────────────────────────

export type TextureKind = 'paper' | 'linen' | 'grain' | 'canvas';

export interface SolidFill {
  type: 'solid';
  color: string;
}

export interface LinearGradientFill {
  type: 'linear';
  colorA: string;
  colorB: string;
  /** Degrees: 0 = top→bottom, 90 = left→right, 45 = top-left→bottom-right. */
  angle: number;
}

export interface RadialGradientFill {
  type: 'radial';
  colorA: string; // center
  colorB: string; // edge
}

export interface TextureFill {
  type: 'texture';
  kind: TextureKind;
  color: string; // base tint color
}

export type BlockFill =
  | SolidFill
  | LinearGradientFill
  | RadialGradientFill
  | TextureFill;

/** Returns the dominant single color of a fill — used for caption contrast and palette chip matching. */
export function blockFillPrimaryColor(fill: BlockFill): string {
  return fill.type === 'solid' || fill.type === 'texture'
    ? fill.color
    : fill.colorA;
}

// ── Shape ────────────────────────────────────────────────────────────────────

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
  /**
   * Font size multiplier relative to the auto-calculated base size.
   * 1.0 = default, range 0.3–3.0.
   */
  sizeScale: number;
}

export interface Composition {
  image: HTMLImageElement | null;
  imageName: string;
  /** 5 hex strings extracted via median-cut. */
  palette: string[];
  layout: Layout;
  /** The fill style of the color block. */
  blockFill: BlockFill;
  /** Target canvas aspect ratio. 'auto' uses natural photo dimensions. */
  canvasRatio: CanvasRatio;
  /**
   * Fraction of the canvas (along the split axis) occupied by the photo.
   * 0.5 = equal split (default). Range 0.3–0.7.
   * Only meaningful when canvasRatio !== 'auto'.
   */
  splitRatio: number;
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
