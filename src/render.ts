import type { Composition, Layout, Rect, Ratio, Shape } from './types';
import { contrastInk, buildAutoCaption } from './palette';
import { getShapePath } from './shapes';

const PAPER = '#FAFAF7';
const IMAGE_PAD_BG = '#FFFFFF';

const RATIO_MAP: Record<Ratio, [number, number]> = {
  '3:4': [3, 4],
  '4:3': [4, 3],
  '1:1': [1, 1],
  '9:16': [9, 16],
  '16:9': [16, 9],
};

export function ratioToDimensions(
  ratio: Ratio,
  longest = 1600
): { width: number; height: number } {
  const [a, b] = RATIO_MAP[ratio];
  if (a >= b) {
    return { width: longest, height: Math.round((longest * b) / a) };
  }
  return { width: Math.round((longest * a) / b), height: longest };
}

export function computeRects(
  layout: Layout,
  splitRatio: number,
  w: number,
  h: number
): { imageRect: Rect; colorRect: Rect } {
  const s = Math.max(0.15, Math.min(0.85, splitRatio));
  switch (layout) {
    case 'image-top':
      return {
        imageRect: { x: 0, y: 0, w, h: h * s },
        colorRect: { x: 0, y: h * s, w, h: h * (1 - s) },
      };
    case 'image-bottom':
      return {
        colorRect: { x: 0, y: 0, w, h: h * (1 - s) },
        imageRect: { x: 0, y: h * (1 - s), w, h: h * s },
      };
    case 'image-left':
      return {
        imageRect: { x: 0, y: 0, w: w * s, h },
        colorRect: { x: w * s, y: 0, w: w * (1 - s), h },
      };
    case 'image-right':
      return {
        colorRect: { x: 0, y: 0, w: w * (1 - s), h },
        imageRect: { x: w * (1 - s), y: 0, w: w * s, h },
      };
  }
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;
  const scale = Math.min(rect.w / iw, rect.h / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const dx = rect.x + (rect.w - drawW) / 2;
  const dy = rect.y + (rect.h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw === 0 || ih === 0) return;
  const scale = Math.max(rect.w / iw, rect.h / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const dx = rect.x + (rect.w - drawW) / 2;
  const dy = rect.y + (rect.h - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

/**
 * Build an offscreen canvas whose entire area is filled with the image at
 * cover-fit. Used as the "see-through" source for cutout shapes.
 */
function buildCoverBacking(
  img: HTMLImageElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.fillStyle = IMAGE_PAD_BG;
  ctx.fillRect(0, 0, w, h);
  drawImageCover(ctx, img, { x: 0, y: 0, w, h });
  return c;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  rect: Rect
): void {
  const px = rect.x + shape.x * rect.w;
  const py = rect.y + shape.y * rect.h;
  const unit = Math.min(rect.w, rect.h) * shape.size * 0.5;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(shape.rotation);
  ctx.scale(unit, unit);
  const path = getShapePath(shape.kind);
  ctx.fill(path);
  ctx.restore();
}

const FONT_MAP: Record<Composition['caption']['font'], string> = {
  'serif-italic':
    "italic 400 16px 'DM Serif Display', 'Source Han Serif CN', 'Songti SC', Georgia, serif",
  serif:
    "400 16px 'DM Serif Display', 'Source Han Serif CN', 'Songti SC', Georgia, serif",
  sans:
    "500 16px 'Inter', 'PingFang SC', system-ui, sans-serif",
  mono:
    "500 16px 'JetBrains Mono', ui-monospace, monospace",
};

export interface RenderOptions {
  /** Output pixel width (final bitmap). */
  width: number;
  /** Output pixel height. */
  height: number;
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: Composition,
  { width, height }: RenderOptions
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  const { imageRect, colorRect } = computeRects(
    state.layout,
    state.splitRatio,
    width,
    height
  );

  // --- Image half ----------------------------------------------------------
  if (state.image) {
    ctx.save();
    const path = new Path2D();
    path.rect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
    ctx.clip(path);
    if (state.imageFit === 'contain') {
      ctx.fillStyle = IMAGE_PAD_BG;
      ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
      drawImageContain(ctx, state.image, imageRect);
    } else {
      drawImageCover(ctx, state.image, imageRect);
    }
    ctx.restore();
  } else {
    // Placeholder for empty image half
    ctx.save();
    ctx.fillStyle = '#F4F2EC';
    ctx.fillRect(imageRect.x, imageRect.y, imageRect.w, imageRect.h);
    ctx.strokeStyle = '#D6D3C9';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      imageRect.x + 12,
      imageRect.y + 12,
      imageRect.w - 24,
      imageRect.h - 24
    );
    ctx.restore();
  }

  // --- Color block ---------------------------------------------------------
  const blockLayer = document.createElement('canvas');
  blockLayer.width = Math.max(1, Math.round(colorRect.w));
  blockLayer.height = Math.max(1, Math.round(colorRect.h));
  const bctx = blockLayer.getContext('2d');
  if (bctx) {
    // Start filled with the block color
    bctx.fillStyle = state.blockColor;
    bctx.fillRect(0, 0, blockLayer.width, blockLayer.height);

    const localRect: Rect = {
      x: 0,
      y: 0,
      w: blockLayer.width,
      h: blockLayer.height,
    };

    // Solid shapes
    for (const s of state.shapes) {
      if (s.fillMode !== 'solid') continue;
      bctx.fillStyle = s.color;
      drawShape(bctx, s, localRect);
    }

    // Cutouts: punch through the block layer to reveal a cover-fit copy of
    // the image underneath. This is how DNA cutouts work (like raindrops in
    // reference image ②).
    const cutouts = state.shapes.filter((s) => s.fillMode === 'cutout');
    if (cutouts.length > 0 && state.image) {
      bctx.save();
      bctx.globalCompositeOperation = 'destination-out';
      for (const s of cutouts) {
        bctx.fillStyle = '#000';
        drawShape(bctx, s, localRect);
      }
      bctx.restore();

      // Replace the holes with the cover-fit image region at the color block
      // coordinates of the *full canvas* (so the image reads continuously).
      const coverBacking = buildCoverBacking(state.image, width, height);
      bctx.save();
      bctx.globalCompositeOperation = 'destination-over';
      bctx.drawImage(
        coverBacking,
        colorRect.x,
        colorRect.y,
        blockLayer.width,
        blockLayer.height,
        0,
        0,
        blockLayer.width,
        blockLayer.height
      );
      bctx.restore();
    }

    ctx.drawImage(blockLayer, colorRect.x, colorRect.y);
  }

  // --- Caption -------------------------------------------------------------
  if (state.caption.enabled) {
    const text =
      state.caption.text.trim() !== ''
        ? state.caption.text
        : buildAutoCaption(state.blockColor);
    if (text) {
      const baseFont = FONT_MAP[state.caption.font];
      const size = Math.max(14, Math.min(colorRect.w, colorRect.h) * 0.05);
      const font = baseFont.replace('16px', `${size}px`);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `${contrastInk(state.blockColor)}D0`;
      ctx.fillText(
        text,
        colorRect.x + colorRect.w / 2,
        colorRect.y + colorRect.h / 2
      );
    }
  }

  ctx.restore();
}
