import './style.css';

import { store, createInitialState } from './state';
import type { BlockFill, CanvasRatio, Composition, FillMode, Layout, Shape, ShapeKind, TextureKind } from './types';
import { blockFillPrimaryColor } from './types';
import { extractPalette, buildAutoCaption, contrastInk } from './palette';
import { SHAPE_KINDS, randomShapeId } from './shapes';
import {
  render,
  renderGrid,
  composeFromState,
  scaleLayoutToMaxEdge,
  chooseReadableLayout,
  hitTestShape,
} from './render';
import {
  initLang,
  setLang,
  getLang,
  t,
  tFormat,
  notifyLangChange,
  onLangChange,
} from './i18n';

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

const resetBtn = $<HTMLButtonElement>('reset-btn');
const exportBtn = $<HTMLButtonElement>('export-btn');

const layoutGrid = $<HTMLDivElement>('layout-grid');
const ratioGrid = $<HTMLDivElement>('ratio-grid');
const splitRatioInput = $<HTMLInputElement>('split-ratio');
const splitRatioValueEl = $<HTMLOutputElement>('split-ratio-value');
const splitRatioField = $<HTMLDivElement>('split-ratio-field');

const paletteChips = $<HTMLDivElement>('palette-chips');
const paletteHint = $<HTMLSpanElement>('palette-hint');
const blockColorInput = $<HTMLInputElement>('block-color');
const paletteEyedropperBtn = $<HTMLButtonElement>('palette-eyedropper');

const fillTypeTabs = $<HTMLDivElement>('fill-type-tabs');
const fillPanelSolid = $<HTMLDivElement>('fill-panel-solid');
const fillPanelGradient = $<HTMLDivElement>('fill-panel-gradient');
const fillPanelTexture = $<HTMLDivElement>('fill-panel-texture');
const gradColorAInput = $<HTMLInputElement>('gradient-color-a');
const gradColorBInput = $<HTMLInputElement>('gradient-color-b');
const gradDirGroup = $<HTMLDivElement>('gradient-dir-group');
const textureGridEl = $<HTMLDivElement>('texture-grid');
const textureColorInput = $<HTMLInputElement>('texture-color');

const modeGroup = $<HTMLDivElement>('mode-group');
const shapeColorInput = $<HTMLInputElement>('shape-color');
const sizeRange = $<HTMLInputElement>('size-range');
const sizeValueEl = $<HTMLOutputElement>('size-value');
const shapeGrid = $<HTMLDivElement>('shape-grid');
const shapeTextInput = $<HTMLInputElement>('shape-text-input');
const addTextBtn = $<HTMLButtonElement>('add-text-btn');
const scatterBtn = $<HTMLButtonElement>('scatter-btn');
const clearShapesBtn = $<HTMLButtonElement>('clear-shapes-btn');
const selectionHint = $<HTMLParagraphElement>('selection-hint');

const captionEnabled = $<HTMLInputElement>('caption-enabled');
const captionText = $<HTMLInputElement>('caption-text');
const captionAutoHint = $<HTMLParagraphElement>('caption-auto-hint');
const fontGroup = $<HTMLDivElement>('font-group');
const captionSizeRange = $<HTMLInputElement>('caption-size-range');
const captionSizeValue = $<HTMLOutputElement>('caption-size-value');

const stage = $<HTMLElement>('stage');
const stageInner = $<HTMLDivElement>('stage-inner');
const gridStripEl = $<HTMLDivElement>('grid-strip');
const stageEmpty = $<HTMLDivElement>('stage-empty');
const stageMeta = $<HTMLParagraphElement>('stage-meta');
const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context unavailable');

const downloadAnchor = $<HTMLAnchorElement>('download-anchor');

const zoomHud = $<HTMLDivElement>('zoom-hud');
const zoomOutBtn = $<HTMLButtonElement>('zoom-out-btn');
const zoomValBtn = $<HTMLButtonElement>('zoom-val-btn');
const zoomInBtn = $<HTMLButtonElement>('zoom-in-btn');

/* =============================================================================
   Shape grid — populated from the SHAPE_KINDS registry
   ============================================================================= */
function buildShapeGrid(): void {
  shapeGrid.innerHTML = '';
  for (const { kind } of SHAPE_KINDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shape-btn';
    btn.dataset.kind = kind;
    btn.dataset.shapeKind = kind;
    refreshShapeBtnLabel(btn, kind);

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

function refreshShapeBtnLabel(btn: HTMLButtonElement, kind: ShapeKind): void {
  const name = t(`shape.${kind}`);
  const label = tFormat('shape.add', name);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function refreshAllShapeBtnLabels(): void {
  for (const btn of shapeGrid.querySelectorAll<HTMLButtonElement>(
    '[data-shape-kind]'
  )) {
    const kind = btn.dataset.shapeKind as ShapeKind;
    refreshShapeBtnLabel(btn, kind);
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
   Grid mode state
   ============================================================================= */
interface GridModeState {
  cells: (Composition | null)[];
  activeIndex: number;
}

let appMode: 'single' | 'grid' = 'single';
const gridModeState: GridModeState = {
  cells: Array.from({ length: 9 }, () => null),
  activeIndex: 0,
};

/** 'global' = left panel affects all cells; 'single' = affects only the active cell. */
let gridEditLevel: 'global' | 'single' = 'global';

/** Master composition for global editing — holds shared non-image settings. */
let gridGlobalTemplate: Composition = { ...createInitialState(), canvasRatio: '1:1' };

/**
 * Keys from the global template that propagate to every cell.
 * blockFill is intentionally excluded — each cell keeps its own extracted color.
 */
const GRID_GLOBAL_KEYS: ReadonlyArray<keyof Composition> = [
  'layout', 'canvasRatio', 'splitRatio',
  'caption', 'activeFillMode', 'activeShapeColor', 'activeShapeSize',
];

function getEffectiveCells(): (Composition | null)[] {
  // In single mode the active cell comes from the live store; others from gridModeState.
  // In global mode the cells are already kept in sync via propagateGlobalToAllCells.
  if (gridEditLevel === 'single') {
    const cells = [...gridModeState.cells];
    cells[gridModeState.activeIndex] = store.get();
    return cells;
  }
  return [...gridModeState.cells];
}

/** Copy shared panel settings from the global template to every populated cell. */
function propagateGlobalToAllCells(s: Composition): void {
  const shared: Partial<Composition> = {};
  for (const k of GRID_GLOBAL_KEYS) {
    (shared as Record<string, unknown>)[k] = s[k];
  }
  for (let i = 0; i < 9; i++) {
    if (gridModeState.cells[i]) {
      gridModeState.cells[i] = { ...gridModeState.cells[i]!, ...shared };
    }
  }
}

/* =============================================================================
   File handling — upload, drop, paste
   ============================================================================= */

/** Decode a File into a Composition without touching the store. */
async function fileToComposition(file: File): Promise<Composition | null> {
  if (!file.type.startsWith('image/')) return null;
  const src = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
  const palette = extractPalette(img, 5);
  const firstColor = palette[0] ?? '#E6B422';
  const s = store.get();
  // In grid mode cells are always 1:1; in single mode respect current setting.
  const canvasRatio: CanvasRatio = appMode === 'grid' ? '1:1' : s.canvasRatio;
  const nextLayout = canvasRatio !== 'auto'
    ? s.layout
    : chooseReadableLayout(img.naturalWidth, img.naturalHeight, s.layout);
  return {
    ...createInitialState(),
    image: img,
    imageName: file.name,
    palette: palette.length > 0 ? palette : createInitialState().palette,
    blockFill: { type: 'solid' as const, color: firstColor },
    shapes: [],
    selectedShapeId: null,
    canvasRatio,
    layout: nextLayout,
  };
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    window.alert(
      getLang() === 'zh'
        ? '请选一张图片文件（JPG / PNG / WebP / GIF）。'
        : 'Please pick an image file (JPG / PNG / WebP / GIF).'
    );
    return;
  }
  const composition = await fileToComposition(file);
  if (!composition) {
    window.alert(
      getLang() === 'zh' ? '无法解析这张图片。' : 'Could not decode this image.'
    );
    return;
  }
  viewZoom = 1;
  store.set(composition);
  fileNameEl.textContent = file.name;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (store.get().image) {
        centerStageScroll();
        syncZoomHud();
      }
    });
  });
}

/** Return index of the first cell with no image, or 0 if all filled. */
function findFirstEmptyCell(): number {
  for (let i = 0; i < 9; i++) {
    if (!gridModeState.cells[i]?.image) return i;
  }
  return 0;
}

/** Batch-load files into grid cells starting from startIdx (wraps around). */
async function loadFilesToGrid(files: File[], startIdx: number): Promise<void> {
  const images = files.filter(f => f.type.startsWith('image/')).slice(0, 9);
  if (images.length === 0) return;
  let filled = 0;
  for (const file of images) {
    const idx = (startIdx + filled) % 9;
    const composition = await fileToComposition(file);
    if (!composition) continue;
    gridModeState.cells[idx] = composition;
    if (gridEditLevel === 'single' && idx === gridModeState.activeIndex) {
      store.set(composition);
    }
    filled++;
  }

  if (gridEditLevel === 'global') {
    // Propagate layout/ratio/caption to new cells; each cell keeps its own blockFill.
    propagateGlobalToAllCells(store.get());
  }

  renderGridStrip();
  // gridModeState changed without a store update, so force canvas repaint.
  paint(store.get());
}

/** Route incoming files to the appropriate handler based on mode + edit level. */
async function handleFiles(files: FileList | File[]): Promise<void> {
  const arr = Array.isArray(files) ? files : Array.from(files);
  if (arr.length === 0) return;
  if (appMode === 'grid') {
    if (gridEditLevel === 'global') {
      // Fill from the first empty slot (batch-friendly)
      await loadFilesToGrid(arr, findFirstEmptyCell());
    } else {
      // Single-cell mode: load into (and after) the active cell
      await loadFilesToGrid(arr, gridModeState.activeIndex);
    }
  } else {
    const file = arr[0];
    if (file) await loadFile(file);
  }
}

/* =============================================================================
   Grid mode — switch, cell selection, strip rendering
   ============================================================================= */
function switchAppMode(mode: 'single' | 'grid'): void {
  if (appMode === mode) return;
  appMode = mode;
  document.body.dataset.appMode = mode;
  syncAppModeToggleUi();

  if (mode === 'grid') {
    const prev = store.get();
    // Global template holds shared non-color settings (blockFill NOT propagated).
    gridGlobalTemplate = {
      ...createInitialState(),
      canvasRatio: '1:1' as const,
      layout: prev.layout,
      splitRatio: prev.splitRatio,
      caption: prev.caption,
    };
    setGridEditLevel('global');
    store.set(gridGlobalTemplate);
    fileInput.multiple = true;
    gridStripEl.hidden = false;
    renderGridStrip();
  } else {
    fileInput.multiple = false;
    gridStripEl.hidden = true;
    if (gridEditLevel === 'single') {
      const cell = gridModeState.cells[gridModeState.activeIndex];
      if (cell) store.set(cell);
    }
    setGridEditLevel('global');
  }
  paint(store.get());
}

function setGridEditLevel(level: 'global' | 'single'): void {
  gridEditLevel = level;
  document.body.dataset.gridEdit = level;
}

/** Enter global-edit level: left panel changes propagate to all cells. */
function enterGridGlobalEdit(): void {
  if (gridEditLevel === 'single') {
    gridModeState.cells[gridModeState.activeIndex] = { ...store.get() };
  }
  setGridEditLevel('global');
  store.set({ ...gridGlobalTemplate });
  fileNameEl.textContent = t('file.empty');
  renderGridStrip();
}

/** Enter single-cell edit level for a specific cell. */
function enterGridSingleEdit(index: number): void {
  if (gridEditLevel === 'global') {
    gridGlobalTemplate = { ...store.get() };
  } else {
    gridModeState.cells[gridModeState.activeIndex] = { ...store.get() };
  }
  gridModeState.activeIndex = index;
  setGridEditLevel('single');
  const cell = gridModeState.cells[index];
  if (cell) {
    store.set(cell);
    fileNameEl.textContent = cell.imageName || t('file.empty');
  } else {
    store.set({ ...createInitialState(), canvasRatio: '1:1' });
    fileNameEl.textContent = t('file.empty');
  }
  renderGridStrip();
}

function renderGridStrip(): void {
  gridStripEl.innerHTML = '';

  // ── "全局" chip ──────────────────────────────────────────────────────────
  const globalBtn = document.createElement('button');
  globalBtn.type = 'button';
  globalBtn.className =
    'grid-thumb grid-global-btn' + (gridEditLevel === 'global' ? ' is-active' : '');
  globalBtn.title = '全局设置 — 对所有格子生效';
  globalBtn.setAttribute('role', 'option');
  globalBtn.setAttribute('aria-selected', gridEditLevel === 'global' ? 'true' : 'false');
  const globalLabel = document.createElement('span');
  globalLabel.className = 'grid-thumb__label';
  globalLabel.textContent = '全局';
  globalBtn.appendChild(globalLabel);
  globalBtn.addEventListener('click', enterGridGlobalEdit);
  gridStripEl.appendChild(globalBtn);

  // Separator
  const sep = document.createElement('div');
  sep.className = 'grid-strip__sep';
  sep.setAttribute('aria-hidden', 'true');
  gridStripEl.appendChild(sep);

  // ── 9 cell thumbnails ────────────────────────────────────────────────────
  for (let i = 0; i < 9; i++) {
    const isActive = gridEditLevel === 'single' && i === gridModeState.activeIndex;
    const cell = isActive ? store.get() : gridModeState.cells[i];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid-thumb' + (isActive ? ' is-active' : '');
    btn.dataset.gridIndex = String(i);
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.title = cell?.imageName ? cell.imageName : `格 ${i + 1}`;

    if (cell?.image) {
      const c = document.createElement('canvas');
      const S = 60;
      c.width = S; c.height = S;
      c.style.cssText = 'width:100%;height:100%;display:block;';
      const tc = c.getContext('2d');
      if (tc) render(tc, cell, { width: S, height: S });
      btn.appendChild(c);
    } else {
      const span = document.createElement('span');
      span.className = 'grid-thumb__num';
      span.textContent = String(i + 1);
      btn.appendChild(span);
    }

    btn.addEventListener('click', () => enterGridSingleEdit(i));
    gridStripEl.appendChild(btn);
  }
}

function syncAppModeToggleUi(): void {
  const group = document.getElementById('app-mode-toggle');
  if (!group) return;
  for (const btn of group.querySelectorAll<HTMLButtonElement>('[data-app-mode]')) {
    const active = btn.dataset.appMode === appMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  }
}

function wireAppModeToggle(): void {
  const group = document.getElementById('app-mode-toggle');
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-app-mode]');
    if (!btn) return;
    switchAppMode(btn.dataset.appMode as 'single' | 'grid');
  });
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
    if (fileInput.files && fileInput.files.length > 0) {
      void handleFiles(fileInput.files);
    }
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
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void handleFiles(files);
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
        if (f) void handleFiles([f]);
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

function wireRatioGrid(): void {
  ratioGrid.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ratio]');
    if (!btn) return;
    store.set({ canvasRatio: btn.dataset.ratio as CanvasRatio });
  });
}

function wireSplitRatio(): void {
  splitRatioInput.addEventListener('input', () => {
    store.set({ splitRatio: parseInt(splitRatioInput.value, 10) / 100 });
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

/** 将 #rgb / #rrggbb 规范为 6 位小写，与 `blockColor` 和 `input[type=color]` 对齐。 */
function normalizeBlockColorHex(hex: string): string {
  const t = hex.trim();
  if (/^#([0-9a-fA-F]{3})$/i.test(t)) {
    const a = t.slice(1);
    return (
      `#${a[0]!}${a[0]!}${a[1]!}${a[1]!}${a[2]!}${a[2]!}`
    ).toLowerCase();
  }
  if (/^#([0-9a-fA-F]{6})$/i.test(t)) return t.toLowerCase();
  return '#e6b422';
}

/** Update the "primary color" slot of the current fill (colorA for gradients, color for solid/texture). */
function patchBlockFillPrimary(hex: string): void {
  const fill = store.get().blockFill;
  if (fill.type === 'solid') {
    store.set({ blockFill: { ...fill, color: hex } });
  } else if (fill.type === 'linear') {
    store.set({ blockFill: { ...fill, colorA: hex } });
  } else if (fill.type === 'radial') {
    store.set({ blockFill: { ...fill, colorA: hex } });
  } else {
    store.set({ blockFill: { ...fill, color: hex } });
  }
}

/**
 * In global grid mode: propagate fill type + structural properties (angle, kind)
 * from the template's blockFill to every cell, preserving each cell's own primary color.
 */
function propagateBlockFillStructureToAllCells(templateFill: BlockFill): void {
  for (let i = 0; i < 9; i++) {
    const cell = gridModeState.cells[i];
    if (!cell) continue;
    const primary = blockFillPrimaryColor(cell.blockFill);
    let newFill: BlockFill;
    if (templateFill.type === 'solid') {
      newFill = { type: 'solid', color: primary };
    } else if (templateFill.type === 'linear') {
      newFill = { type: 'linear', colorA: primary, colorB: templateFill.colorB, angle: templateFill.angle };
    } else if (templateFill.type === 'radial') {
      newFill = { type: 'radial', colorA: primary, colorB: templateFill.colorB };
    } else {
      newFill = { type: 'texture', kind: templateFill.kind, color: primary };
    }
    gridModeState.cells[i] = { ...cell, blockFill: newFill };
  }
}

function switchFillType(tab: 'solid' | 'gradient' | 'texture'): void {
  const s = store.get();
  const primary = blockFillPrimaryColor(s.blockFill);
  const fill = s.blockFill;
  if (tab === 'solid') {
    if (fill.type === 'solid') return;
    store.set({ blockFill: { type: 'solid' as const, color: primary } });
  } else if (tab === 'gradient') {
    if (fill.type === 'linear' || fill.type === 'radial') return;
    const colorB = '#ffffff';
    store.set({ blockFill: { type: 'linear' as const, colorA: primary, colorB, angle: 0 } });
  } else {
    if (fill.type === 'texture') return;
    store.set({ blockFill: { type: 'texture' as const, kind: 'paper', color: primary } });
  }
}

function wireFillTypeTabs(): void {
  fillTypeTabs.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fill-type]');
    if (!btn) return;
    switchFillType(btn.dataset.fillType as 'solid' | 'gradient' | 'texture');
    if (appMode === 'grid' && gridEditLevel === 'global') {
      propagateBlockFillStructureToAllCells(store.get().blockFill);
      paint(store.get());
    }
  });
}

function wireSolidColorPicker(): void {
  blockColorInput.addEventListener('input', () => {
    patchBlockFillPrimary(normalizeBlockColorHex(blockColorInput.value));
  });
  paletteEyedropperBtn.addEventListener('click', async () => {
    const Win = window as unknown as {
      EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
    };
    const Ed = Win.EyeDropper;
    if (typeof Ed !== 'function') {
      window.alert(t('palette.eyedropper.unsupported'));
      return;
    }
    try {
      const result = await new Ed().open();
      if (result?.sRGBHex) {
        patchBlockFillPrimary(normalizeBlockColorHex(result.sRGBHex));
      }
    } catch {
      // 用户取消取色
    }
  });
}

function wireGradientPanel(): void {
  gradColorAInput.addEventListener('input', () => {
    const fill = store.get().blockFill;
    if (fill.type === 'linear') store.set({ blockFill: { ...fill, colorA: gradColorAInput.value } });
    else if (fill.type === 'radial') store.set({ blockFill: { ...fill, colorA: gradColorAInput.value } });
  });
  gradColorBInput.addEventListener('input', () => {
    const fill = store.get().blockFill;
    if (fill.type === 'linear') store.set({ blockFill: { ...fill, colorB: gradColorBInput.value } });
    else if (fill.type === 'radial') store.set({ blockFill: { ...fill, colorB: gradColorBInput.value } });
  });
  gradDirGroup.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-angle]');
    if (!btn) return;
    const fill = store.get().blockFill;
    const colorA = (fill.type === 'linear' || fill.type === 'radial') ? fill.colorA : blockFillPrimaryColor(fill);
    const colorB = (fill.type === 'linear' || fill.type === 'radial') ? fill.colorB : '#ffffff';
    if (btn.dataset.angle === 'radial') {
      store.set({ blockFill: { type: 'radial' as const, colorA, colorB } });
    } else {
      const angle = parseInt(btn.dataset.angle!, 10);
      store.set({ blockFill: { type: 'linear' as const, colorA, colorB, angle } });
    }
    if (appMode === 'grid' && gridEditLevel === 'global') {
      propagateBlockFillStructureToAllCells(store.get().blockFill);
      paint(store.get());
    }
  });
}

function wireTexturePanel(): void {
  textureGridEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-texture]');
    if (!btn) return;
    const kind = btn.dataset.texture as TextureKind;
    const fill = store.get().blockFill;
    const color = fill.type === 'texture' ? fill.color : blockFillPrimaryColor(fill);
    store.set({ blockFill: { type: 'texture' as const, kind, color } });
    if (appMode === 'grid' && gridEditLevel === 'global') {
      propagateBlockFillStructureToAllCells(store.get().blockFill);
      paint(store.get());
    }
  });
  textureColorInput.addEventListener('input', () => {
    const fill = store.get().blockFill;
    if (fill.type !== 'texture') return;
    store.set({ blockFill: { ...fill, color: textureColorInput.value } });
  });
}

function wireShapeColor(): void {
  shapeColorInput.addEventListener('input', () => {
    store.set({ activeShapeColor: shapeColorInput.value });
  });
}

function wireShapeSize(): void {
  sizeRange.addEventListener('input', () => {
    const size = parseInt(sizeRange.value, 10) / 100;
    const s = store.get();
    // If a shape is currently selected, resize it live. Otherwise just update
    // the "default for future shapes" setting.
    if (s.selectedShapeId) {
      const shapes = s.shapes.map((sh) =>
        sh.id === s.selectedShapeId ? { ...sh, size } : sh
      );
      store.set({ activeShapeSize: size, shapes });
    } else {
      store.set({ activeShapeSize: size });
    }
  });
}

function wireTextAdder(): void {
  const submit = (): void => {
    const text = shapeTextInput.value.trim();
    if (!text) return;
    addShape('text', 1, { text });
    shapeTextInput.value = '';
    store.set({ activeShapeText: '' });
  };
  shapeTextInput.addEventListener('input', () => {
    store.set({ activeShapeText: shapeTextInput.value });
  });
  shapeTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  addTextBtn.addEventListener('click', submit);
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
  captionSizeRange.addEventListener('input', () => {
    const sizeScale = parseInt(captionSizeRange.value, 10) / 100;
    store.patch((s) => ({ ...s, caption: { ...s.caption, sizeScale } }));
  });
}

/* =============================================================================
   Canvas pointer interactions — click to select, drag to move.
   Coordinates: pointer events arrive in CSS pixels; our render also works in
   CSS pixels (DPR is applied via ctx.setTransform). So event coords inside
   the canvas map 1:1 to the same space render() uses.
   ============================================================================= */
interface DragState {
  pointerId: number;
  shapeId: string;
  startX: number;
  startY: number;
  shapeStartX: number;
  shapeStartY: number;
}
let drag: DragState | null = null;

function getCanvasPoint(ev: PointerEvent | MouseEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
  };
}

function wireCanvasInteraction(): void {
  canvas.addEventListener('pointerdown', (e) => {
    const pt = getCanvasPoint(e);
    const s = store.get();
    const hit = hitTestShape(
      s,
      { w: currentCanvasSize.cssW, h: currentCanvasSize.cssH },
      pt.x,
      pt.y
    );
    if (hit) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = {
        pointerId: e.pointerId,
        shapeId: hit.id,
        startX: pt.x,
        startY: pt.y,
        shapeStartX: hit.x,
        shapeStartY: hit.y,
      };
      canvas.classList.add('is-dragging-shape');
      store.set({ selectedShapeId: hit.id });
    } else if (s.selectedShapeId) {
      store.set({ selectedShapeId: null });
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.pointerId) {
      const pt = getCanvasPoint(e);
      const s = store.get();
      const layout = composeFromState(s);
      const scale = Math.min(
        currentCanvasSize.cssW / layout.canvasW,
        currentCanvasSize.cssH / layout.canvasH
      );
      const crWcss = layout.colorRect.w * scale;
      const crHcss = layout.colorRect.h * scale;
      if (crWcss <= 0 || crHcss <= 0) return;
      // Delta in color-rect-normalized units.
      const dxNorm = (pt.x - drag.startX) / crWcss;
      const dyNorm = (pt.y - drag.startY) / crHcss;
      const nextX = clamp(drag.shapeStartX + dxNorm, 0, 1);
      const nextY = clamp(drag.shapeStartY + dyNorm, 0, 1);
      const shapes = s.shapes.map((sh) =>
        sh.id === drag!.shapeId ? { ...sh, x: nextX, y: nextY } : sh
      );
      store.set({ shapes });
      return;
    }

    // Hover cursor hint (pointer not pressed)
    const pt = getCanvasPoint(e);
    const s = store.get();
    const hit = hitTestShape(
      s,
      { w: currentCanvasSize.cssW, h: currentCanvasSize.cssH },
      pt.x,
      pt.y
    );
    canvas.classList.toggle('is-hovering-shape', !!hit);
  });

  const endDrag = (e: PointerEvent): void => {
    if (drag && e.pointerId === drag.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // pointer may already have been released
      }
      drag = null;
      canvas.classList.remove('is-dragging-shape');
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    canvas.classList.remove('is-hovering-shape');
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wireKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    // Don't hijack typing in inputs
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }
    const s = store.get();
    if (!s.selectedShapeId) return;
    e.preventDefault();
    const shapes = s.shapes.filter((sh) => sh.id !== s.selectedShapeId);
    store.set({ shapes, selectedShapeId: null });
  });
}

function wireTopBar(): void {
  resetBtn.addEventListener('click', () => {
    const s = store.get();
    const naturalLayout = s.image
      ? chooseReadableLayout(
          s.image.naturalWidth,
          s.image.naturalHeight,
          'image-bottom'
        )
      : 'image-bottom';
    store.set({
      layout: naturalLayout,
      blockFill: { type: 'solid' as const, color: s.palette[0] ?? blockFillPrimaryColor(s.blockFill) },
      shapes: [],
      selectedShapeId: null,
      activeShapeSize: 0.12,
      caption: { ...s.caption, text: '' },
    });
    captionText.value = '';
    shapeTextInput.value = '';
  });

  exportBtn.addEventListener('click', () => {
    exportPng();
  });
}

/* =============================================================================
   Shape interactions
   ============================================================================= */
/**
 * Blue-noise position sampler using Mitchell's best-candidate algorithm.
 * For each new point, generate N random candidates and pick the one whose
 * nearest neighbor among `existing` is farthest. Points also stay away from
 * the edges of the color block.
 */
function pickScatterPosition(
  existing: Array<{ x: number; y: number }>
): { x: number; y: number } {
  const CANDIDATES = 14;
  const MARGIN = 0.08;
  let best = { x: 0.5, y: 0.5 };
  let bestScore = -1;
  for (let i = 0; i < CANDIDATES; i += 1) {
    const cx = MARGIN + Math.random() * (1 - MARGIN * 2);
    const cy = MARGIN + Math.random() * (1 - MARGIN * 2);
    let minDistSq = 4;
    for (const p of existing) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dsq = dx * dx + dy * dy;
      if (dsq < minDistSq) minDistSq = dsq;
    }
    if (minDistSq > bestScore) {
      bestScore = minDistSq;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

interface AddShapeOptions {
  text?: string;
}

function addShape(
  kind: ShapeKind,
  count: number,
  opts: AddShapeOptions = {}
): string | null {
  const s = store.get();
  if (kind === 'text' && (!opts.text || opts.text.trim() === '')) return null;

  const positions = s.shapes.map((sh) => ({ x: sh.x, y: sh.y }));
  const newShapes: Shape[] = [];
  for (let i = 0; i < count; i += 1) {
    const pos = pickScatterPosition(positions);
    positions.push(pos);
    const shape: Shape = {
      id: randomShapeId(),
      kind,
      x: pos.x,
      y: pos.y,
      // Uniform default size — no more random jitter — user controls via slider.
      size: s.activeShapeSize,
      // A small rotation jitter still looks more hand-placed than axis-aligned
      // text. For text shapes, keep rotation at 0 so it stays readable.
      rotation:
        kind === 'text' ? 0 : (Math.random() - 0.5) * Math.PI * 0.35,
      color: s.activeShapeColor,
      fillMode: s.activeFillMode,
      ...(kind === 'text' && {
        text: opts.text!,
        font: s.caption.font,
      }),
    };
    newShapes.push(shape);
  }
  const appended = [...s.shapes, ...newShapes];
  const lastId = newShapes[newShapes.length - 1]?.id ?? null;
  store.set({ shapes: appended, selectedShapeId: lastId });
  return lastId;
}

function scatterCurrent(): void {
  const s = store.get();
  const last = s.shapes[s.shapes.length - 1];
  if (last && last.kind === 'text') {
    addShape('text', 8, { text: last.text ?? '' });
    return;
  }
  const kind: ShapeKind = last ? last.kind : 'star';
  addShape(kind, 8);
}

scatterBtn.addEventListener('click', scatterCurrent);
clearShapesBtn.addEventListener('click', () =>
  store.set({ shapes: [], selectedShapeId: null })
);

/* =============================================================================
   Export
   ============================================================================= */
function exportPng(): void {
  if (appMode === 'grid') {
    exportGridPng();
    return;
  }
  const s = store.get();
  if (!s.image) {
    window.alert(
      getLang() === 'zh' ? '先上传一张照片。' : 'Upload a photo first.'
    );
    return;
  }
  const composed = composeFromState(s);
  const { width, height } = scaleLayoutToMaxEdge(composed, 2400);
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
        : 'fuguang';
      downloadAnchor.href = url;
      downloadAnchor.download = `${stem}__${width}x${height}__${Date.now()}.png`;
      downloadAnchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    'image/png',
    0.96
  );
}

function exportGridPng(): void {
  const cells = getEffectiveCells();
  const SIZE = 2700; // 3×3 at 900px each
  const off = document.createElement('canvas');
  off.width = SIZE;
  off.height = SIZE;
  const oc = off.getContext('2d');
  if (!oc) return;
  renderGrid(oc, cells, { width: SIZE, height: SIZE });
  off.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      downloadAnchor.href = url;
      downloadAnchor.download = `shimmer-grid__${SIZE}x${SIZE}__${Date.now()}.png`;
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

/** 用户缩放倍数，基于「cover 填满预览区」后的基准尺寸。 */
const VIEW_ZOOM_MIN = 0.25;
const VIEW_ZOOM_MAX = 4;
let viewZoom = 1;

function centerStageScroll(): void {
  const el = stageInner;
  const sw = el.scrollWidth - el.clientWidth;
  const sh = el.scrollHeight - el.clientHeight;
  if (sw > 0) el.scrollLeft = sw * 0.5;
  if (sh > 0) el.scrollTop = sh * 0.5;
}

/**
 * 默认用「contain」在 stage 内完整放下拼图（一眼能看全），再乘 viewZoom；滚轮/按钮可再放大看细节。
 * CSS 宽高锁定与布局比例一致，避免在 Bitmap 与 render 中双重留白。
 */
function fitCanvasToStage(state: Composition): void {
  const rect = stageInner.getBoundingClientRect();
  const composed = composeFromState(state);
  const rw = Math.max(1, rect.width);
  const rh = Math.max(1, rect.height);
  const cW = composed.canvasW;
  const cH = composed.canvasH;
  const fitScale = Math.min(rw / cW, rh / cH);
  const s = fitScale * viewZoom;
  // 锁定与构图相同宽高比，避免 CSS 与 render 目标框比例微偏。
  let cssW: number;
  let cssH: number;
  if (cW >= cH) {
    cssW = Math.max(64, Math.floor(cW * s + 0.5));
    const h = Math.round((cssW * cH) / cW);
    if (h < 64) {
      cssH = 64;
      cssW = Math.max(64, Math.round((64 * cW) / cH));
    } else {
      cssH = h;
    }
  } else {
    cssH = Math.max(64, Math.floor(cH * s + 0.5));
    const w = Math.round((cssH * cW) / cH);
    if (w < 64) {
      cssW = 64;
      cssH = Math.max(64, Math.round((64 * cH) / cW));
    } else {
      cssW = w;
    }
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  currentCanvasSize = { cssW, cssH };
}

/** Fit the canvas to a 1:1 square for the 9-grid view. */
function fitGridCanvasToStage(): void {
  const rect = stageInner.getBoundingClientRect();
  const size = Math.max(64, Math.min(rect.width, rect.height));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  currentCanvasSize = { cssW: size, cssH: size };
}

function paint(state: Composition): void {
  if (appMode === 'grid') {
    fitGridCanvasToStage();
    renderGrid(ctx!, getEffectiveCells(), {
      width: currentCanvasSize.cssW,
      height: currentCanvasSize.cssH,
      activeIndex: gridEditLevel === 'single' ? gridModeState.activeIndex : -1,
      showActiveRing: gridEditLevel === 'single',
    });
  } else {
    fitCanvasToStage(state);
    render(ctx!, state, {
      width: currentCanvasSize.cssW,
      height: currentCanvasSize.cssH,
      showSelection: true,
    });
  }
}

function syncZoomHud(): void {
  if (!store.get().image) return;
  zoomValBtn.textContent = `${Math.round(viewZoom * 100)}%`;
}

/**
 * 更新用户缩放。recenter 时滚轮/按钮缩放后把滚动位置回中（便于看全局）。
 */
function applyViewZoom(
  next: number,
  opts: { recenter?: boolean } = { recenter: true }
): void {
  if (!store.get().image) return;
  const clamped = clamp(next, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
  if (Math.abs(clamped - viewZoom) < 1e-5) return;
  viewZoom = clamped;
  paint(store.get());
  syncZoomHud();
  if (opts.recenter) {
    requestAnimationFrame(() => centerStageScroll());
  }
}

function wireStageZoom(): void {
  const onWheel = (e: WheelEvent): void => {
    if (!store.get().image) return;
    const canScrollH = stageInner.scrollWidth > stageInner.clientWidth + 0.5;
    const canScrollV = stageInner.scrollHeight > stageInner.clientHeight + 0.5;
    const modifierZoom = e.ctrlKey || e.metaKey;
    const canWheelOnlyZoom = !canScrollH && !canScrollV;
    if (!modifierZoom && !canWheelOnlyZoom) return;
    e.preventDefault();
    const up = e.deltaY < 0;
    const factor = Math.exp((up ? 1 : -1) * 0.09);
    applyViewZoom(viewZoom * factor);
  };
  stageInner.addEventListener('wheel', onWheel, { passive: false });
}

function wireZoomHud(): void {
  zoomInBtn.addEventListener('click', () => {
    applyViewZoom(viewZoom * 1.1);
  });
  zoomOutBtn.addEventListener('click', () => {
    applyViewZoom(viewZoom / 1.1);
  });
  zoomValBtn.addEventListener('click', () => {
    applyViewZoom(1, { recenter: true });
  });
  zoomValBtn.addEventListener('dblclick', (e) => {
    e.preventDefault();
    applyViewZoom(1, { recenter: true });
  });
}

/* =============================================================================
   Sync DOM ← State (one-way: store is source of truth for UI state)
   ============================================================================= */
let lastPalette = '';

function syncEmptyState(state: Composition): void {
  if (appMode === 'grid') {
    // Grid mode always shows the canvas regardless of image state.
    stageEmpty.hidden = true;
    stageInner.hidden = false;
    stageMeta.hidden = true;
    zoomHud.hidden = true;
    return;
  }
  const hasImage = !!state.image;
  stageEmpty.hidden = hasImage;
  stageInner.hidden = !hasImage;
  stageMeta.hidden = !hasImage;
  zoomHud.hidden = !hasImage;
}

function syncUi(state: Composition): void {
  syncEmptyState(state);

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

  // Canvas ratio chips
  for (const btn of ratioGrid.querySelectorAll<HTMLButtonElement>('[data-ratio]')) {
    const active = btn.dataset.ratio === state.canvasRatio;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  }
  splitRatioField.hidden = state.canvasRatio === 'auto';
  if (state.canvasRatio !== 'auto') {
    const pct = Math.round(state.splitRatio * 100);
    if (splitRatioInput.value !== String(pct)) splitRatioInput.value = String(pct);
    splitRatioValueEl.value = `${pct}%`;
  }

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

  // Shape size — when something is selected, the slider reflects that shape
  // (the slider is a live control for it). Otherwise it reflects the default
  // for new shapes.
  const selectedShape = state.selectedShapeId
    ? state.shapes.find((sh) => sh.id === state.selectedShapeId) ?? null
    : null;
  const displayedSize = selectedShape
    ? selectedShape.size
    : state.activeShapeSize;
  const pctSize = Math.round(displayedSize * 100);
  if (sizeRange.value !== String(pctSize)) sizeRange.value = String(pctSize);
  sizeValueEl.value = displayedSize.toFixed(2);

  // Selection hint
  selectionHint.hidden = !state.selectedShapeId;

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
        chip.dataset.hex === blockFillPrimaryColor(state.blockFill)
      );
    }
  }
  paletteHint.textContent = state.image
    ? tFormat('palette.hint.extracted', state.palette.length)
    : t('palette.hint.empty');

  // Sync fill-type tab highlights + panel visibility
  const fillType = state.blockFill.type;
  const activeTab = (fillType === 'linear' || fillType === 'radial') ? 'gradient' : fillType;
  for (const btn of fillTypeTabs.querySelectorAll<HTMLButtonElement>('[data-fill-type]')) {
    btn.classList.toggle('is-active', btn.dataset.fillType === activeTab);
    btn.setAttribute('aria-checked', btn.dataset.fillType === activeTab ? 'true' : 'false');
  }
  fillPanelSolid.hidden    = fillType !== 'solid';
  fillPanelGradient.hidden = fillType !== 'linear' && fillType !== 'radial';
  fillPanelTexture.hidden  = fillType !== 'texture';

  // Sync solid color picker
  if (fillType === 'solid') {
    const blockNorm = normalizeBlockColorHex(state.blockFill.color);
    if (blockColorInput.value.toLowerCase() !== blockNorm) blockColorInput.value = blockNorm;
  }

  // Sync gradient color pickers + direction buttons
  if (fillType === 'linear' || fillType === 'radial') {
    const gFill = state.blockFill as typeof state.blockFill & { colorA: string; colorB: string };
    if (gradColorAInput.value !== gFill.colorA) gradColorAInput.value = gFill.colorA;
    if (gradColorBInput.value !== gFill.colorB) gradColorBInput.value = gFill.colorB;
    for (const btn of gradDirGroup.querySelectorAll<HTMLButtonElement>('[data-angle]')) {
      let active: boolean;
      if (btn.dataset.angle === 'radial') {
        active = fillType === 'radial';
      } else {
        active = fillType === 'linear' &&
          (state.blockFill as Extract<BlockFill, { type: 'linear' }>).angle === parseInt(btn.dataset.angle!, 10);
      }
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  }

  // Sync texture panel
  if (fillType === 'texture') {
    const tFill = state.blockFill as Extract<BlockFill, { type: 'texture' }>;
    if (textureColorInput.value !== tFill.color) textureColorInput.value = tFill.color;
    for (const btn of textureGridEl.querySelectorAll<HTMLButtonElement>('[data-texture]')) {
      const active = btn.dataset.texture === tFill.kind;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    }
  }

  // Caption
  if (captionEnabled.checked !== state.caption.enabled)
    captionEnabled.checked = state.caption.enabled;
  if (captionText.value !== state.caption.text)
    captionText.value = state.caption.text;
  captionAutoHint.textContent = tFormat(
    'caption.auto',
    buildAutoCaption(blockFillPrimaryColor(state.blockFill))
  );
  for (const btn of fontGroup.querySelectorAll<HTMLButtonElement>(
    '[data-font]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.font === state.caption.font);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.font === state.caption.font ? 'true' : 'false'
    );
  }
  const sizeScalePct = Math.round((state.caption.sizeScale ?? 1) * 100).toString();
  if (captionSizeRange.value !== sizeScalePct) captionSizeRange.value = sizeScalePct;
  captionSizeValue.textContent = `${sizeScalePct}%`;

  // Stage meta
  const composed = composeFromState(state);
  const imgDims = state.image
    ? `${state.image.naturalWidth}×${state.image.naturalHeight}`
    : '—';
  const canvasDims = `${Math.round(composed.canvasW)}×${Math.round(composed.canvasH)}`;
  stageMeta.textContent = [
    `${t('stage.meta.photo')} ${imgDims}`,
    `${t('stage.meta.canvas')} ${canvasDims}`,
    blockFillPrimaryColor(state.blockFill),
  ].join('  ·  ');

  // File name
  fileNameEl.textContent = state.imageName || t('file.empty');

  // Export button enabled when at least one cell has an image
  exportBtn.disabled = appMode === 'grid'
    ? !getEffectiveCells().some(c => c?.image)
    : !state.image;

  if (state.image) syncZoomHud();
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
    if (hex === blockFillPrimaryColor(state.blockFill)) chip.classList.add('is-active');

    const code = document.createElement('span');
    code.className = 'palette-chip__code';
    code.style.color = contrastInk(hex);
    code.textContent = hex.toLowerCase();
    chip.appendChild(code);

    chip.addEventListener('click', () => patchBlockFillPrimary(hex));
    paletteChips.appendChild(chip);
  }
}

/* =============================================================================
   Bootstrap
   ============================================================================= */
function wireLangToggle(): void {
  const group = document.querySelector<HTMLDivElement>('.lang-toggle');
  if (!group) return;
  group.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      '[data-lang]'
    );
    if (!btn) return;
    const lang = btn.dataset.lang as 'zh' | 'en';
    setLang(lang);
    syncLangToggleUi();
    refreshAllShapeBtnLabels();
    notifyLangChange();
    // Re-sync dynamic UI strings under the new language
    store.set({}); // triggers a no-op update so syncUi runs with new t()
  });
}

function syncLangToggleUi(): void {
  const cur = getLang();
  for (const btn of document.querySelectorAll<HTMLButtonElement>(
    '.lang-toggle [data-lang]'
  )) {
    btn.classList.toggle('is-active', btn.dataset.lang === cur);
    btn.setAttribute(
      'aria-checked',
      btn.dataset.lang === cur ? 'true' : 'false'
    );
  }
}

function init(): void {
  initLang();
  syncLangToggleUi();

  buildShapeGrid();
  wireFileInput();
  wireLayoutGrid();
  wireRatioGrid();
  wireSplitRatio();
  wireModeGroup();
  wireFillTypeTabs();
  wireSolidColorPicker();
  wireGradientPanel();
  wireTexturePanel();
  wireShapeColor();
  wireShapeSize();
  wireTextAdder();
  wireCanvasInteraction();
  wireKeyboard();
  wireCaption();
  wireTopBar();
  wireLangToggle();
  wireAppModeToggle();
  wireStageZoom();
  wireZoomHud();

  onLangChange(() => {
    refreshAllShapeBtnLabels();
  });

  let pending = false;
  const schedule = (state: Composition): void => {
    // In global grid mode every panel change propagates to all cells immediately.
    if (appMode === 'grid' && gridEditLevel === 'global') {
      propagateGlobalToAllCells(state);
    }
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
