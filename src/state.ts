import type { Composition } from './types';

export type Listener = (state: Composition) => void;

export function createInitialState(): Composition {
  return {
    image: null,
    imageName: '',
    palette: ['#E6B422', '#B49BD0', '#9FB28A', '#D8A7A1', '#4A6BAF'],
    layout: 'image-bottom',
    blockFill: { type: 'solid' as const, color: '#E6B422' },
    caption: {
      enabled: true,
      text: '',
      font: 'serif-italic',
    },
    activeFillMode: 'cutout',
    activeShapeColor: '#111111',
    activeShapeSize: 0.12,
    activeShapeText: '',
    shapes: [],
    selectedShapeId: null,
  };
}

export class Store {
  private state: Composition;
  private listeners = new Set<Listener>();

  constructor(initial: Composition) {
    this.state = initial;
  }

  get(): Composition {
    return this.state;
  }

  set(partial: Partial<Composition>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  patch(updater: (s: Composition) => Composition): void {
    this.state = updater(this.state);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}

export const store = new Store(createInitialState());
