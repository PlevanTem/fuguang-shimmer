import type { BlockFill, Composition, FontKey, Layout, Rect, Shape, TextureKind } from './types';
import { blockFillPrimaryColor } from './types';
import { contrastInk, buildAutoCaption } from './palette';
import { getShapePath } from './shapes';

const PAPER = '#FAFAF7';
const PLACEHOLDER_IVORY = '#F4F2EC';
const PLACEHOLDER_HAIRLINE = '#D6D3C9';

/** When no image is loaded, use this nominal 4:3 shape so the empty canvas reads compactly. */
const PLACEHOLDER_IMAGE_W = 1600;
const PLACEHOLDER_IMAGE_H = 1200;

export interface ComposedLayout {
  /** Intrinsic canvas dimensions in px, derived from photo + layout. */
  canvasW: number;
  canvasH: number;
  /** Rectangle the photo occupies, at its natural aspect ratio. */
  imageRect: Rect;
  /** Rectangle the color block occupies. Same width (split-v) or height (split-h) as the photo. */
  colorRect: Rect;
}

/**
 * The core compositional rule:
 * - The photo keeps its natural aspect ratio (no letterboxing, no cropping).
 * - The color block has exactly the same dimensions as the photo (mirror).
 * - The canvas is exactly photo + colorBlock stacked or side-by-side.
 */
export function composeLayout(
  imageW: number,
  imageH: number,
  layout: Layout
): ComposedLayout {
  if (layout === 'image-top') {
    return {
      canvasW: imageW,
      canvasH: imageH * 2,
      imageRect: { x: 0, y: 0, w: imageW, h: imageH },
      colorRect: { x: 0, y: imageH, w: imageW, h: imageH },
    };
  }
  if (layout === 'image-bottom') {
    return {
      canvasW: imageW,
      canvasH: imageH * 2,
      colorRect: { x: 0, y: 0, w: imageW, h: imageH },
      imageRect: { x: 0, y: imageH, w: imageW, h: imageH },
    };
  }
  if (layout === 'image-left') {
    return {
      canvasW: imageW * 2,
      canvasH: imageH,
      imageRect: { x: 0, y: 0, w: imageW, h: imageH },
      colorRect: { x: imageW, y: 0, w: imageW, h: imageH },
    };
  }
  // image-right
  return {
    canvasW: imageW * 2,
    canvasH: imageH,
    colorRect: { x: 0, y: 0, w: imageW, h: imageH },
    imageRect: { x: imageW, y: 0, w: imageW, h: imageH },
  };
}

/** Compose based on the current state — uses placeholders when no image. */
export function composeFromState(state: Composition): ComposedLayout {
  const w = state.image?.naturalWidth ?? PLACEHOLDER_IMAGE_W;
  const h = state.image?.naturalHeight ?? PLACEHOLDER_IMAGE_H;
  return composeLayout(w, h, state.layout);
}

/**
 * Pick a layout orientation that keeps the final canvas aspect close to a
 * readable square-ish rectangle (between 0.5 and 2.0). If the current
 * orientation would produce an extreme canvas for this photo, flip 90°.
 */
export function chooseReadableLayout(
  imageW: number,
  imageH: number,
  current: Layout
): Layout {
  const photoAspect = imageW / imageH;
  const isVertical = current === 'image-top' || current === 'image-bottom';
  const canvasAspect = isVertical ? photoAspect / 2 : photoAspect * 2;

  if (canvasAspect >= 0.5 && canvasAspect <= 2.0) return current;

  switch (current) {
    case 'image-top':
      return 'image-left';
    case 'image-bottom':
      return 'image-right';
    case 'image-left':
      return 'image-top';
    case 'image-right':
      return 'image-bottom';
  }
}

/** Scale a composed layout so the longest edge is `maxEdge` pixels — for export. */
export function scaleLayoutToMaxEdge(
  layout: ComposedLayout,
  maxEdge: number
): { scale: number; width: number; height: number } {
  const longest = Math.max(layout.canvasW, layout.canvasH);
  const scale = maxEdge / longest;
  return {
    scale,
    width: Math.round(layout.canvasW * scale),
    height: Math.round(layout.canvasH * scale),
  };
}

export const FONT_MAP: Record<FontKey, string> = {
  'serif-italic':
    "italic 400 16px 'DM Serif Display', 'Source Han Serif CN', 'Songti SC', Georgia, serif",
  serif:
    "400 16px 'DM Serif Display', 'Source Han Serif CN', 'Songti SC', Georgia, serif",
  sans: "500 16px 'Inter', 'PingFang SC', system-ui, sans-serif",
  mono: "500 16px 'JetBrains Mono', ui-monospace, monospace",
};

// ── Block fill rendering ────────────────────────────────────────────────────

function makeLinearGradient(
  bctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colorA: string,
  colorB: string,
  angleDeg: number
): CanvasGradient {
  const rad = (angleDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  // Compute the half-length along the gradient axis so it spans edge-to-edge.
  const half = (Math.abs(w * sin) + Math.abs(h * cos)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  const g = bctx.createLinearGradient(
    cx - sin * half, cy - cos * half,
    cx + sin * half, cy + cos * half
  );
  g.addColorStop(0, colorA);
  g.addColorStop(1, colorB);
  return g;
}

// Cache texture tiles: generated once per kind, reused every frame.
const _textureTileCache = new Map<TextureKind, HTMLCanvasElement>();

function _buildPaperTile(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  // Seeded LCG for deterministic, reproducible grain
  let seed = 0x3141592;
  const rng = (): number => {
    seed = ((seed * 1664525 + 1013904223) >>> 0);
    return seed / 0x100000000;
  };
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const rowBase = (rng() - 0.5) * 30; // slight row-level brightness (simulates fiber)
    for (let x = 0; x < S; x++) {
      const px = (rng() - 0.5) * 20;
      const v = rowBase + px;
      const i = (y * S + x) * 4;
      if (v > 0) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.min(v | 0, 38);
      } else {
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = Math.min((-v) | 0, 28);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function _buildGrainTile(): HTMLCanvasElement {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  let seed = 0x9E3779B9;
  const rng = (): number => {
    seed = ((seed * 1664525 + 1013904223) >>> 0);
    return seed / 0x100000000;
  };
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = (rng() - 0.5) * 80;
      const i = (y * S + x) * 4;
      if (v > 0) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.min(v | 0, 65);
      } else {
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = Math.min((-v) | 0, 52);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function _buildLinenTile(): HTMLCanvasElement {
  const S = 6;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(0, 0, S, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';       ctx.fillRect(0, 2, S, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, 4, S, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, 0, 1, S);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';       ctx.fillRect(2, 0, 1, S);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(4, 0, 1, S);
  return c;
}

function _buildCanvasTile(): HTMLCanvasElement {
  const S = 12;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(0, 0, S, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';       ctx.fillRect(0, 2, S, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 6, S, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';       ctx.fillRect(0, 8, S, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, 1, S);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';       ctx.fillRect(2, 0, 2, S);
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(6, 0, 1, S);
  ctx.fillStyle = 'rgba(0,0,0,0.09)';       ctx.fillRect(8, 0, 2, S);
  return c;
}

function _getTextureTile(kind: TextureKind): HTMLCanvasElement {
  let tile = _textureTileCache.get(kind);
  if (!tile) {
    switch (kind) {
      case 'paper':  tile = _buildPaperTile();  break;
      case 'grain':  tile = _buildGrainTile();  break;
      case 'linen':  tile = _buildLinenTile();  break;
      case 'canvas': tile = _buildCanvasTile(); break;
    }
    _textureTileCache.set(kind, tile);
  }
  return tile;
}

/** Fill the color block layer with the given BlockFill. */
function applyBlockFill(
  bctx: CanvasRenderingContext2D,
  fill: BlockFill,
  w: number,
  h: number
): void {
  if (fill.type === 'linear') {
    bctx.fillStyle = makeLinearGradient(bctx, w, h, fill.colorA, fill.colorB, fill.angle);
    bctx.fillRect(0, 0, w, h);
    return;
  }
  if (fill.type === 'radial') {
    const r = Math.sqrt(w * w + h * h) / 2;
    const g = bctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
    g.addColorStop(0, fill.colorA);
    g.addColorStop(1, fill.colorB);
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, w, h);
    return;
  }
  // solid or texture: fill base color first
  bctx.fillStyle = fill.type === 'solid' ? fill.color : fill.color;
  bctx.fillRect(0, 0, w, h);
  if (fill.type === 'texture') {
    const tile = _getTextureTile(fill.kind);
    const pat = bctx.createPattern(tile, 'repeat');
    if (pat) {
      bctx.fillStyle = pat;
      bctx.fillRect(0, 0, w, h);
    }
  }
}

function shapeFont(shape: Shape, unit: number): string {
  const font = shape.font ?? 'serif-italic';
  const fontSize = unit * 2;
  return FONT_MAP[font].replace('16px', `${fontSize.toFixed(1)}px`);
}

/**
 * Draw a shape into ctx. Caller must have already set up fillStyle and any
 * compositing mode (destination-out for cutout, source-over for solid).
 */
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  rect: Rect
): void {
  const px = rect.x + shape.x * rect.w;
  const py = rect.y + shape.y * rect.h;
  const unit = Math.min(rect.w, rect.h) * shape.size * 0.5;

  if (shape.kind === 'text') {
    const text = shape.text ?? '';
    if (!text) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(shape.rotation);
    ctx.font = shapeFont(shape, unit);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(shape.rotation);
  ctx.scale(unit, unit);
  const path = getShapePath(shape.kind);
  ctx.fill(path);
  ctx.restore();
}

/**
 * Compute the axis-aligned bounding half-size of a shape in its local
 * (pre-rotation) coordinate system — used both for the selection box and for
 * hit-testing. Returns the half-width/height in rect pixel units.
 */
function shapeLocalHalfSize(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  rect: Rect
): { hw: number; hh: number; unit: number } {
  const unit = Math.min(rect.w, rect.h) * shape.size * 0.5;
  if (shape.kind === 'text') {
    const text = shape.text ?? '';
    ctx.save();
    ctx.font = shapeFont(shape, unit);
    const m = ctx.measureText(text);
    ctx.restore();
    const hw = Math.max(unit * 0.5, m.width / 2 + 4);
    const hh = unit * 1.2;
    return { hw, hh, unit };
  }
  return { hw: unit, hh: unit, unit };
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  rect: Rect
): void {
  const px = rect.x + shape.x * rect.w;
  const py = rect.y + shape.y * rect.h;
  const { hw, hh, unit } = shapeLocalHalfSize(ctx, shape, rect);
  const pad = Math.max(6, unit * 0.18);

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(shape.rotation);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#111111';
  ctx.strokeRect(-hw - pad, -hh - pad, (hw + pad) * 2, (hh + pad) * 2);
  // Corner dots for a more "handle-ish" feel
  ctx.setLineDash([]);
  ctx.fillStyle = '#111111';
  const dot = 3;
  const cx = hw + pad;
  const cy = hh + pad;
  for (const [sx, sy] of [
    [-cx, -cy],
    [cx, -cy],
    [-cx, cy],
    [cx, cy],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx, sy, dot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* -----------------------------------------------------------------------------
   Hit testing — returns the topmost shape at the given point, or null.
   Coordinates must be in the same space as the render's (width, height).
   ----------------------------------------------------------------------------- */
const hitCtx = (() => {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  return c.getContext('2d')!;
})();

export function hitTestShape(
  state: Composition,
  rect: { w: number; h: number },
  pointX: number,
  pointY: number
): Shape | null {
  const layout = composeFromState(state);
  const { scale, originX, originY } = getLayoutViewTransform(
    layout,
    rect.w,
    rect.h
  );
  const colorRect: Rect = {
    x: originX + layout.colorRect.x * scale,
    y: originY + layout.colorRect.y * scale,
    w: layout.colorRect.w * scale,
    h: layout.colorRect.h * scale,
  };

  // Short-circuit: point must be within color block (that's where shapes live)
  if (
    pointX < colorRect.x ||
    pointX > colorRect.x + colorRect.w ||
    pointY < colorRect.y ||
    pointY > colorRect.y + colorRect.h
  ) {
    return null;
  }

  // Iterate in reverse (top-most shapes first)
  for (let i = state.shapes.length - 1; i >= 0; i -= 1) {
    const shape = state.shapes[i];
    if (!shape) continue;
    if (shapeContainsPoint(shape, colorRect, pointX, pointY)) return shape;
  }
  return null;
}

function shapeContainsPoint(
  shape: Shape,
  colorRect: Rect,
  pointX: number,
  pointY: number
): boolean {
  const cx = colorRect.x + shape.x * colorRect.w;
  const cy = colorRect.y + shape.y * colorRect.h;
  // Inverse-transform into shape-local coords (pre-rotation, pre-scale-down)
  const dx = pointX - cx;
  const dy = pointY - cy;
  const cos = Math.cos(-shape.rotation);
  const sin = Math.sin(-shape.rotation);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;

  if (shape.kind === 'text') {
    const { hw, hh } = shapeLocalHalfSize(hitCtx, shape, colorRect);
    return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
  }

  const unit = Math.min(colorRect.w, colorRect.h) * shape.size * 0.5;
  if (unit <= 0) return false;
  const ux = lx / unit;
  const uy = ly / unit;
  if (ux < -1.2 || ux > 1.2 || uy < -1.2 || uy > 1.2) return false;
  const path = getShapePath(shape.kind);
  return hitCtx.isPointInPath(path, ux, uy);
}

/**
 * 将构图等比放入 (w×h)，与 render 一致，并居中以消除子像素比例偏差时的左上留白感。
 */
function getLayoutViewTransform(
  layout: ComposedLayout,
  w: number,
  h: number
): { scale: number; originX: number; originY: number } {
  const scale = Math.min(w / layout.canvasW, h / layout.canvasH);
  const originX = (w - layout.canvasW * scale) * 0.5;
  const originY = (h - layout.canvasH * scale) * 0.5;
  return { scale, originX, originY };
}

export interface RenderOptions {
  /** Output canvas pixel width — must match composed layout scaled. */
  width: number;
  /** Output canvas pixel height. */
  height: number;
  /** Whether to draw the current selection indicator (omit for exports). */
  showSelection?: boolean;
}

/**
 * Render the composition into `ctx` sized to (width, height).
 * The composed layout is scaled uniformly to match the requested target size.
 */
export function render(
  ctx: CanvasRenderingContext2D,
  state: Composition,
  options: RenderOptions
): void {
  const { width, height, showSelection = false } = options;
  const layout = composeFromState(state);
  const { scale, originX, originY } = getLayoutViewTransform(
    layout,
    width,
    height
  );

  const imageRect: Rect = {
    x: originX + layout.imageRect.x * scale,
    y: originY + layout.imageRect.y * scale,
    w: layout.imageRect.w * scale,
    h: layout.imageRect.h * scale,
  };
  const colorRect: Rect = {
    x: originX + layout.colorRect.x * scale,
    y: originY + layout.colorRect.y * scale,
    w: layout.colorRect.w * scale,
    h: layout.colorRect.h * scale,
  };

  ctx.save();
  // 不可重置为 identity：调用方在预览画布上已设 dpr 变换；否则会只在物理像素区左上角作图，出现「拼图挤在 canvas 左上、右下大量留白」。
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  // --- Image half ---------------------------------------------------------
  if (state.image) {
    ctx.drawImage(state.image, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
  } else {
    ctx.fillStyle = PLACEHOLDER_IVORY;
    ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
    ctx.strokeStyle = PLACEHOLDER_HAIRLINE;
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      imageRect.x + 12,
      imageRect.y + 12,
      imageRect.w - 24,
      imageRect.h - 24
    );
    ctx.setLineDash([]);
  }

  // --- Color block --------------------------------------------------------
  const blockLayer = document.createElement('canvas');
  blockLayer.width = Math.max(1, Math.round(colorRect.w));
  blockLayer.height = Math.max(1, Math.round(colorRect.h));
  const bctx = blockLayer.getContext('2d');
  if (bctx) {
    applyBlockFill(bctx, state.blockFill, blockLayer.width, blockLayer.height);

    const localRect: Rect = {
      x: 0,
      y: 0,
      w: blockLayer.width,
      h: blockLayer.height,
    };

    for (const s of state.shapes) {
      if (s.fillMode !== 'solid') continue;
      bctx.fillStyle = s.color;
      drawShape(bctx, s, localRect);
    }

    const cutouts = state.shapes.filter((s) => s.fillMode === 'cutout');
    if (cutouts.length > 0 && state.image) {
      bctx.save();
      bctx.globalCompositeOperation = 'destination-out';
      for (const s of cutouts) {
        bctx.fillStyle = '#000';
        drawShape(bctx, s, localRect);
      }
      bctx.restore();

      bctx.save();
      bctx.globalCompositeOperation = 'destination-over';
      const iw = state.image.naturalWidth;
      const ih = state.image.naturalHeight;
      const coverScale = Math.max(
        blockLayer.width / iw,
        blockLayer.height / ih
      );
      const dw = iw * coverScale;
      const dh = ih * coverScale;
      const dx = (blockLayer.width - dw) / 2;
      const dy = (blockLayer.height - dh) / 2;
      bctx.drawImage(state.image, dx, dy, dw, dh);
      bctx.restore();
    }

    ctx.drawImage(blockLayer, colorRect.x, colorRect.y);
  }

  // --- Caption ------------------------------------------------------------
  if (state.caption.enabled) {
    const text =
      state.caption.text.trim() !== ''
        ? state.caption.text
        : buildAutoCaption(blockFillPrimaryColor(state.blockFill));
    if (text) {
      const baseFont = FONT_MAP[state.caption.font];
      const size = Math.max(14, Math.min(colorRect.w, colorRect.h) * 0.05);
      const font = baseFont.replace('16px', `${size}px`);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `${contrastInk(blockFillPrimaryColor(state.blockFill))}D0`;
      ctx.fillText(
        text,
        colorRect.x + colorRect.w / 2,
        colorRect.y + colorRect.h / 2
      );
    }
  }

  // --- Selection indicator (on top of everything) -------------------------
  if (showSelection && state.selectedShapeId) {
    const selected = state.shapes.find(
      (s) => s.id === state.selectedShapeId
    );
    if (selected) drawSelection(ctx, selected, colorRect);
  }

  ctx.restore();
}
