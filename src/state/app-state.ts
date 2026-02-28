import type { LoadedFile } from '../schema/types.js';
import type { Confidence, Direction } from '../schema/types.js';

export type ViewMode = 'cards' | 'flow' | 'comparison';

export interface AppState {
  files: LoadedFile[];
  activeView: ViewMode;
  filters: {
    confidence: Set<Confidence>;
    direction: Set<Direction>;
  };
  errors: { filename: string; errors: string[] }[];
  selectedAggregate: string | null;
  sidebarCollapsed: boolean;
  fileManagerOpen: boolean;
}

type Listener = () => void;

const ALL_CONFIDENCE = new Set<Confidence>(['CONFIRMED', 'LIKELY', 'POSSIBLE']);
const ALL_DIRECTION = new Set<Direction>(['inbound', 'outbound', 'internal']);

class Store {
  private state: AppState = {
    files: [],
    activeView: 'cards',
    filters: {
      confidence: new Set(ALL_CONFIDENCE),
      direction: new Set(ALL_DIRECTION),
    },
    errors: [],
    selectedAggregate: null,
    sidebarCollapsed: false,
    fileManagerOpen: false,
  };

  private listeners = new Set<Listener>();

  get(): AppState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  addFile(file: LoadedFile) {
    // Replace if same role already loaded
    this.state = {
      ...this.state,
      files: [
        ...this.state.files.filter((f) => f.role !== file.role),
        file,
      ],
    };
    // Auto-switch to comparison if 2+ files
    if (this.state.files.length >= 2) {
      this.state.activeView = 'comparison';
    }
    this.notify();
  }

  removeFile(role: string) {
    this.state = {
      ...this.state,
      files: this.state.files.filter((f) => f.role !== role),
    };
    if (this.state.files.length < 2 && this.state.activeView === 'comparison') {
      this.state.activeView = 'cards';
    }
    this.notify();
  }

  setView(view: ViewMode) {
    this.state = { ...this.state, activeView: view };
    this.notify();
  }

  toggleConfidence(c: Confidence) {
    const next = new Set(this.state.filters.confidence);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    this.state = {
      ...this.state,
      filters: { ...this.state.filters, confidence: next },
    };
    this.notify();
  }

  toggleDirection(d: Direction) {
    const next = new Set(this.state.filters.direction);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    this.state = {
      ...this.state,
      filters: { ...this.state.filters, direction: next },
    };
    this.notify();
  }

  addError(filename: string, errors: string[]) {
    this.state = {
      ...this.state,
      errors: [...this.state.errors, { filename, errors }],
    };
    this.notify();
  }

  clearErrors() {
    this.state = { ...this.state, errors: [] };
    this.notify();
  }

  setSelectedAggregate(aggregate: string | null) {
    this.state = { ...this.state, selectedAggregate: aggregate };
    this.notify();
  }

  toggleSidebar() {
    this.state = { ...this.state, sidebarCollapsed: !this.state.sidebarCollapsed };
    this.notify();
  }

  setFileManagerOpen(open: boolean) {
    this.state = { ...this.state, fileManagerOpen: open };
    this.notify();
  }
}

export const store = new Store();
