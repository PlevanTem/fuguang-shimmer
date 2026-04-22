import type { ShapeKind } from './types';

/**
 * All shapes are defined on a unit square [-1, 1] × [-1, 1] and traced via
 * Path2D. Render code scales them to fit a requested pixel size. Keeping the
 * vocabulary tiny & recognizable matches the DNA's "hand-held zine" feel.
 */

export const SHAPE_KINDS: ReadonlyArray<{ kind: ShapeKind; label: string }> = [
  { kind: 'dot', label: 'Dot' },
  { kind: 'drop', label: 'Drop' },
  { kind: 'star', label: 'Star' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'music', label: 'Note' },
  { kind: 'wave', label: 'Wave' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'hex', label: 'Hex' },
];

/** Returns a Path2D sized to [-1, 1]². Callers scale via transform. */
export function getShapePath(kind: ShapeKind): Path2D {
  const p = new Path2D();
  switch (kind) {
    case 'dot': {
      p.arc(0, 0, 1, 0, Math.PI * 2);
      return p;
    }
    case 'drop': {
      // Teardrop: circle base + cusp on top
      p.moveTo(0, -1);
      p.bezierCurveTo(0.9, -0.6, 0.9, 0.9, 0, 0.95);
      p.bezierCurveTo(-0.9, 0.9, -0.9, -0.6, 0, -1);
      p.closePath();
      return p;
    }
    case 'star': {
      const outer = 1;
      const inner = 0.42;
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      return p;
    }
    case 'heart': {
      p.moveTo(0, 0.9);
      p.bezierCurveTo(-1.1, 0.3, -1.0, -0.75, -0.4, -0.7);
      p.bezierCurveTo(-0.15, -0.65, 0, -0.45, 0, -0.2);
      p.bezierCurveTo(0, -0.45, 0.15, -0.65, 0.4, -0.7);
      p.bezierCurveTo(1.0, -0.75, 1.1, 0.3, 0, 0.9);
      p.closePath();
      return p;
    }
    case 'music': {
      // Eighth note: stem + oval notehead + flag
      p.moveTo(0.25, -0.95);
      p.lineTo(0.25, 0.4);
      p.lineTo(0.1, 0.4);
      p.lineTo(0.1, -0.55);
      p.bezierCurveTo(0.7, -0.85, 0.8, -0.35, 0.55, -0.6);
      p.closePath();
      // Notehead
      const head = new Path2D();
      head.ellipse(-0.05, 0.55, 0.5, 0.35, -0.3, 0, Math.PI * 2);
      p.addPath(head);
      return p;
    }
    case 'wave': {
      // Horizontal sine stripe (thick line)
      const steps = 40;
      const amp = 0.35;
      const freq = Math.PI * 2;
      const thick = 0.15;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const x = -1 + t * 2;
        const y = Math.sin(t * freq) * amp - thick;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i -= 1) {
        const t = i / steps;
        const x = -1 + t * 2;
        const y = Math.sin(t * freq) * amp + thick;
        p.lineTo(x, y);
      }
      p.closePath();
      return p;
    }
    case 'triangle': {
      p.moveTo(0, -1);
      p.lineTo(0.95, 0.75);
      p.lineTo(-0.95, 0.75);
      p.closePath();
      return p;
    }
    case 'hex': {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a);
        const y = Math.sin(a);
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      p.closePath();
      return p;
    }
  }
}

export function randomShapeId(): string {
  return (
    's_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 7)
  );
}
