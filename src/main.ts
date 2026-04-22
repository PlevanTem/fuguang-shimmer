import './style.css';

import { store } from './state';
import type { Composition, FillMode, Layout, Ratio, ShapeKind } from './types';
import { extractPalette, buildAutoCaption, contrastInk } from './palette';
import { SHAPE_KINDS, randomShapeId } from './shapes';
import { ratioToDimensions, render, computeRects } from './render';

/* =============================================================================
   DOM references (eagerly resolved — tolerant fallbacks not needed for MVP)
   ============================================================================= */
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
};

const fileInput = $<HTMLInputElement>('file-input');
const uploadZone = $<HTMLDivElement>('upload-zone');
const fileNameEl = $<HTMLSpanElement>('file-name');

const ratioSelect = $<HTMLSelectElement>('ratio-select');
const resetBtn = $<HTMLButtonElement>('reset-btn');
const exportBtn = $<HTMLButtonElement>('export-btn');

const layoutGrid = $<HTMLDivElement>('layout-grid');
const splitRange = $<HTMLInputElement>('split-range');
const splitValueEl = $<HTMLOutputElement>('split-value');
const fitGroup = $<HTMLDivElement>('fit-group');

const paletteChips = $<HTMLDivElement>('palette-chips');
const paletteHint = $<HTMLSpanElement>('palette-hint');

const modeGroup = $<HTMLDivElement>('mode-group');
const shapeColorInput = $<HTMLInputElement>('shape-color');
const shapeGrid = $<HTMLDivElement>('shape-grid');
const scatterBtn = $<HTMLButtonElement>('scatter-btn');
const clearShapesBtn = $<HTMLButtonElement>('clear-shapes-btn');

const captionEnabled = $<HTMLInputElement>('caption-enabled');
const captionText = $<HTMLInputElement>('caption-text');
const captionAutoHint = $<HTMLParagraphElement>('caption-auto-hint');
const fontGroup = $<HTMLDivElement>('font-group');

const stage = $<HTMLElement>('stage');
const stageInner = $<HTMLDivElement>('stage-inner');
const stageMeta = $<HTMLParagraphElement>('stage-meta');
const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');

const downloadAnchor = $<HTMLAnchorElement>('download-anchor');

/* =============================================================================
   Shape grid — populated from the SHAPE_KINDS registry
   ============================================================================= */
function buildShapeGrid(): void {
  shapeGrid.innerHTML = '';
  for (const { kind, label } of SHAPE_KINDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shape-btn';
    btn.dataset.kind = kind;
    btn.title = `Add ${label}`;
    btn.setAttribute('aria-label', `Add ${label}`);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-1.1 -1.1 2.2 2.2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', shapePathToSvgD(kind));
    svg.appendChild(path);
    btn.appendChild(svg);

    btn.addEventListener('click', () => addShape(kind, 1));
    shapeGrid.appendChild(btn);
  }
}

/**
 * Lightweight re-derivation of a shape's SVG "d" string, used only for the
 * preview icons in the shape picker. The real rendering goes through
 * getShapePath() + Canvas, which is authoritative.
 */
function shapePathToSvgD(kind: ShapeKind): string {
  // Record into a simple path collector
  const cmds: string[] = [];
  const recorder: Pick<
    CanvasRenderingContext2D,
    | 'moveTo'
    | 'lineTo'
    | 'bezierCurveTo'
    | 'arc'
    | 'ellipse'
    | 'closePath'
  > = {
    moveTo(x: number, y: number) {
      cmds.push(`M${x.toFixed(3)} ${y.toFixed(3)}`);
    },
    lineTo(x: number, y: number) {
      cmds.push(`L${x.toFixed(3)} ${y.toFixed(3)}`);
    },
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      cmds.push(
        `C${cp1x.toFixed(3)} ${cp1y.toFixed(3)} ${cp2x.toFixed(3)} ${cp2y.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)}`
      );
    },
    arc(cx, cy, r, _start, _end) {
      cmds.push(
        `M${(cx - r).toFixed(3)} ${cy.toFixed(3)} A${r} ${r} 0 1 0 ${(cx + r).toFixed(3)} ${cy.toFixed(3)} A${r} ${r} 0 1 0 ${(cx - r).toFixed(3)} ${cy.toFixed(3)}`
      );
    },
    ellipse(cx, cy, rx, ry, _rot, _start, _end) {
      cmds.push(
        `M${(cx - rx).toFixed(3)} ${cy.toFixed(3)} A${rx} ${ry} 0 1 0 ${(cx + rx).toFixed(3)} ${cy.toFixed(3)} A${rx} ${ry} 0 1 0 ${(cx - rx).toFixed(3)} ${cy.toFixed(3)}`
      );
    },
    closePath() {
      cmds.push('Z');
    },
  };

  // Replay the Path2D construction using a tiny proxy CanvasRenderingContext2D
  replayShape(kind, recorder);
  return cmds.join(' ');
}

/** Mirror of getShapePath() but writing commands to a recorder. Keep in sync with shapes.ts. */
function replayShape(
  kind: ShapeKind,
  r: Pick<
    CanvasRenderingContext2D,
    'moveTo' | 'lineTo' | 'bezierCurveTo' | 'arc' | 'ellipse' | 'closePath'
  >
): void {
  switch (kind) {
    case 'dot':
      r.arc(0, 0, 1, 0, Math.PI * 2);
      return;
    case 'drop':
      r.moveTo(0, -1);
      r.bezierCurveTo(0.9, -0.6, 0.9, 0.9, 0, 0.95);
      r.bezierCurveTo(-0.9, 0.9, -0.9, -0.6, 0, -1);
      r.closePath();
      return;
    case 'star': {
      const outer = 1;
      const inner = 0.42;
      for (let i = 0; i < 10; i += 1) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) r.moveTo(x, y);
        else r.lineTo(x, y);
      }
      r.closePath();
      return;
    }
    case 'heart':
      r.moveTo(0, 0.9);
      r.bezierCurveTo(-1.1, 0.3, -1.0, -0.75, -0.4, -0.7);
      r.bezierCurveTo(-0.15, -0.65, 0, -0.45, 0, -0.2);
      r.bezierCurveTo(0, -0.45, 0.15, -0.65, 0.4, -0.7);
      r.bezierCurveTo(1.0, -0.75, 1.1, 0.3, 0, 0.9);
      r.closePath();
      return;
    case 'music':
      r.moveTo(0.25, -0.95);
      r.lineTo(0.25, 0.4);
      r.lineTo(0.1, 0.4);
      r.lineTo(0.1, -0.55);
      r.bezierCurveTo(0.7, -0.85, 0.8, -0.35, 0.55, -0.6);
      r.closePath();
      r.ellipse(-0.05, 0.55, 0.5, 0.35, -0.3, 0, Math.PI * 2);
      return;
    case 'wave': {
      const steps = 40;
      const amp = 0.35;
      const freq = Math.PI * 2;
      const thick = 0.15;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = -1 + t * 2;
        const y = Math.sin(t * freq) * amp - thick;
        if (i === 0) r.moveTo(x, y);
        else r.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i -= 1) {
        const t = i / steps;
        const x = -1 + t * 2;
        const y = Math.sin(t * freq) * amp + thick;
        r.lineTo(x, y);
      }
      r.closePath();
      return;
    }
    case 'triangle':
      r.moveTo(0, -1);
      r.lineTo(0.95, 0.75);
      r.lineTo(-0.95, 0.75);
      r.closePath();
      return;
    case 'hex': {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a);
        const y = Math.sin(a);
        if (i === 0) r.moveTo(x, y);
        else r.lineTo(x, y);
      }
      r.closePath();
      return;
    }
  }
}

/* =============================================================================
   File handling — upload, drop, paste
   ============================================================================= */
async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    window.alert('Please pick an image file (JPG / PNG / WebP / GIF).');
    return;
  }
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  try {
    await img.decode();
  } catch {
    window.alert('Could not decode this image.');
    URL.revokeObjectURL(src);
    return;
  }
  const palette = extractPalette(img, 5);
  const firstColor = palette[0] ?? store.get().palette[0] ?? '#E6B422';
  store.set({
    image: img,
    imageName: file.name,
    palette: palette.length > 0 ? palette : store.get().palette,
    blockColor: firstColor,
    shapes: [],
  });
  fileNameEl.textContent = file.name;
}

function wireFileInput(): void {
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
    fileInput.value = '';
  });

  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    uploadZone.classList.add('is-dragover');
    stage.classList.add('is-dragover');
  };
  const onDragLeave = (): void => {
    uploadZone.classList.remove('is-dragover');
    stage.classList.remove('is-dragover');
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    uploadZone.classList.remove('is-dragover');
    stage.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  };

  for (const target of [uploadZone, stage]) {
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
  }

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) void loadFile(f);
        e.preventDefault();
        return;
      }
    }
  });
}

/* =============================================================================
   Controls wiring
   ============================================================================= */
function wireLayoutGrid(): void {
  layoutGrid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-layout]'
    );
    if (!btn) return;
    const layout = btn.dataset.layout as Layout;
    store.set({ layout });
  });
}

function wireSplitRange(): void {
  splitRange.addEventListener('input', () => {
    const val = parseInt(splitRange.value, 10) / 100;
    store.set({ splitRatio: val });
  });
}

function wireFitGroup(): void {
  fitGroup.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-fit]'
    );
    if (!btn) return;
    store.set({ imageFit: btn.dataset.fit as Composition['imageFit'] });
  });
}

function wireRatioSelect(): void {
  ratioSelect.addEventListener('change', () => {
    store.set({ ratio: ratioSelect.value as Ratio });
  });
}

function wireModeGroup(): void {
  modeGroup.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-mode]'
    );
    if (!btn) return;
    store.set({ activeFillMode: btn.dataset.mode as FillMode });
  });
}

function wireShapeColor(): void {
  shapeColorInput.addEventListener('input', () => {
    store.set({ activeShapeColor: shapeColorInput.value });
  });
}

function wireCaption(): void {
  captionEnabled.addEventListener('change', () => {
    store.patch((s) => ({
      ...s,
      caption: { ...s.caption, enabled: captionEnabled.checked },
    }));
  });
  captionText.addEventListener('input', () => {
    store.patch((s) => ({
      ...s,
      caption: { ...s.caption, text: captionText.value },
    }));
  });
  fontGroup.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-font]'
    );
    if (!btn) return;
    const font = btn.dataset.font as Composition['caption']['font'];
    store.patch((s) => ({ ...s, caption: { ...s.caption, font } }));
  });
}

function wireTopBar(): void {
  resetBtn.addEventListener('click', () => {
    const s = store.get();
    store.set({
      layout: 'image-bottom',
      splitRatio: 0.5,
      imageFit: 'contain',
      blockColor: s.palette[0] ?? s.blockColor,
      shapes: [],
      caption: { ...s.caption, text: '' },
    });
    splitRange.value = '50';
    splitValueEl.value = '50%';
    captionText.value = '';
  });

  exportBtn.addEventListener('click', () => {
    exportPng();
  });
}

/* =============================================================================
   Shape interactions
   ============================================================================= */
function addShape(kind: ShapeKind, count: number): void {
  const s = store.get();
  const newShapes: Composition['shapes'] = [];
  for (let i = 0; i < count; i += 1) {
    newShapes.push({
      id: randomShapeId(),
      kind,
      x: 0.15 + Math.random() * 0.7,
      y: 0.15 + Math.random() * 0.7,
      size: 0.08 + Math.random() * 0.1,
      rotation: (Math.random() - 0.5) * Math.PI * 0.6,
      color: s.activeShapeColor,
      fillMode: s.activeFillMode,
    });
  }
  store.set({ shapes: [...s.shapes, ...newShapes] });
}

function scatterCurrent(): void {
  // Re-add 8 of the last-used shape kind — default to "dot" if none yet
  const s = store.get();
  const last = s.shapes[s.shapes.length - 1];
  const kind: ShapeKind = last ? last.kind : 'dot';
  addShape(kind, 8);
}

scatterBtn.addEventListener('click', scatterCurrent);
clearShapesBtn.addEventListener('click', () => store.set({ shapes: [] }));

/* =============================================================================
   Export
   ============================================================================= */
function exportPng(): void {
  const s = store.get();
  if (!s.image) {
    window.alert('Upload a photo first.');
    return;
  }
  const { width, height } = ratioToDimensions(s.ratio, 2000);
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const oc = off.getContext('2d');
  if (!oc) return;
  render(oc, s, { width, height });
  off.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const stem = s.imageName
        ? s.imageName.replace(/\.[^/.]+$/, '')
        : 'shimmer';
      downloadAnchor.href = url;
      downloadAnchor.download = `${stem}__${s.ratio.replace(':', 'x')}__${Date.now()}.png`;
      downloadAnchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    'image/png',
    0.96
  );
}

/* =============================================================================
   Canvas resize + render loop (triggered via store subscription)
   ============================================================================= */
let currentCanvasSize = { cssW: 0, cssH: 0 };

function fitCanvasToStage(state: Composition): void {
  const rect = stageInner.getBoundingClientRect();
  const { width: ratioW, height: ratioH } = ratioToDimensions(state.ratio, 1);
  const canvasRatio = ratioW / ratioH;
  const stageRatio = rect.width / rect.height;

  let cssW: number;
  let cssH: number;
  if (canvasRatio > stageRatio) {
    cssW = rect.width;
    cssH = rect.width / canvasRatio;
  } else {
    cssH = rect.height;
    cssW = rect.height * canvasRatio;
  }
  cssW = Math.max(64, Math.floor(cssW));
  cssH = Math.max(64, Math.floor(cssH));

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  currentCanvasSize = { cssW, cssH };
}

function paint(state: Composition): void {
  fitCanvasToStage(state);
  render(ctx!, state, {
    width: currentCanvasSize.cssW,
    height: currentCanvasSize.cssH,
  });
}

/* =============================================================================
   Sync DOM ← State (one-way: store is source of truth for UI state)
   ============================================================================= */
let lastPalette = '';

function syncUi(state: Composition): void {
  // Layout chips
  for (const btn of layoutGrid.querySelectorAll<HTMLButtonElement>(
    '[data-layout]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.layout === state.layout);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.layout === state.layout ? 'true' : 'false'
    );
  }

  // Split range
  const pct = Math.round(state.splitRatio * 100);
  if (splitRange.value !== String(pct)) splitRange.value = String(pct);
  splitValueEl.value = `${pct}%`;

  // Fit group
  for (const btn of fitGroup.querySelectorAll<HTMLButtonElement>(
    '[data-fit]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.fit === state.imageFit);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.fit === state.imageFit ? 'true' : 'false'
    );
  }

  // Ratio select
  if (ratioSelect.value !== state.ratio) ratioSelect.value = state.ratio;

  // Fill mode
  for (const btn of modeGroup.querySelectorAll<HTMLButtonElement>(
    '[data-mode]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.mode === state.activeFillMode);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.mode === state.activeFillMode ? 'true' : 'false'
    );
  }
  shapeColorInput.value = state.activeShapeColor;

  // Palette chips — only re-render when palette actually changes
  const paletteKey = state.palette.join('|');
  if (paletteKey !== lastPalette) {
    renderPaletteChips(state);
    lastPalette = paletteKey;
  } else {
    // Only update active highlighting
    for (const chip of paletteChips.querySelectorAll<HTMLButtonElement>(
      '.palette-chip'
    )) {
      chip.classList.toggle(
        'is-active',
        chip.dataset.hex === state.blockColor
      );
    }
  }
  paletteHint.textContent = state.image
    ? `${state.palette.length} swatches extracted`
    : 'upload an image first';

  // Caption
  if (captionEnabled.checked !== state.caption.enabled)
    captionEnabled.checked = state.caption.enabled;
  if (captionText.value !== state.caption.text)
    captionText.value = state.caption.text;
  captionAutoHint.textContent = `auto: ${buildAutoCaption(state.blockColor)}`;
  for (const btn of fontGroup.querySelectorAll<HTMLButtonElement>(
    '[data-font]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.font === state.caption.font);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.font === state.caption.font ? 'true' : 'false'
    );
  }

  // Stage meta
  const rects =
    currentCanvasSize.cssW > 0
      ? computeRects(
          state.layout,
          state.splitRatio,
          currentCanvasSize.cssW,
          currentCanvasSize.cssH
        )
      : null;
  stageMeta.textContent = [
    state.ratio,
    rects
      ? `${Math.round(rects.imageRect.w)}×${Math.round(rects.imageRect.h)} image · ${Math.round(rects.colorRect.w)}×${Math.round(rects.colorRect.h)} block`
      : '—',
    state.blockColor,
  ].join('  ·  ');

  // File name
  fileNameEl.textContent = state.imageName || 'no photo yet';

  // Export button enabled only when image present
  exportBtn.disabled = !state.image;
}

function renderPaletteChips(state: Composition): void {
  paletteChips.innerHTML = '';
  if (state.palette.length === 0) {
    for (let i = 0; i < 5; i += 1) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'palette-chip is-empty';
      empty.disabled = true;
      paletteChips.appendChild(empty);
    }
    return;
  }
  for (const hex of state.palette) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'palette-chip';
    chip.style.background = hex;
    chip.dataset.hex = hex;
    chip.title = `Use ${hex} as color block`;
    chip.setAttribute('aria-label', `Use ${hex} as color block`);
    if (hex === state.blockColor) chip.classList.add('is-active');

    const code = document.createElement('span');
    code.className = 'palette-chip__code';
    code.style.color = contrastInk(hex);
    code.textContent = hex.toLowerCase();
    chip.appendChild(code);

    chip.addEventListener('click', () => store.set({ blockColor: hex }));
    paletteChips.appendChild(chip);
  }
}

/* =============================================================================
   Bootstrap
   ============================================================================= */
function init(): void {
  buildShapeGrid();
  wireFileInput();
  wireLayoutGrid();
  wireSplitRange();
  wireFitGroup();
  wireRatioSelect();
  wireModeGroup();
  wireShapeColor();
  wireCaption();
  wireTopBar();

  let pending = false;
  const schedule = (state: Composition): void => {
    syncUi(state);
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      paint(store.get());
    });
  };

  store.subscribe(schedule);

  const onResize = (): void => schedule(store.get());
  window.addEventListener('resize', onResize, { passive: true });

  // Initial paint must wait one frame so fonts are registered
  requestAnimationFrame(() => paint(store.get()));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

/* ----- HMR cleanup ------------------------------------------------------- */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Full reload on code changes — simpler than diffing a canvas editor
  });
}
