import { create } from 'zustand';
import { api } from './api.js';

/**
 * Editor store: canonical process map + undo/redo history + autosave.
 * The map is the single source of truth; React Flow nodes/edges are derived.
 */
export const useEditorStore = create((set, get) => ({
  processId: null,
  processMeta: null, // {id, projectId, parentId, name, children}
  map: null,
  past: [],
  future: [],
  selection: null, // {kind: 'node'|'edge'|'lane'|'process', id}
  saveState: 'saved', // saved | dirty | saving | error
  toasts: [],

  async load(processId) {
    set({ processId, map: null, past: [], future: [], selection: null, saveState: 'saved' });
    const proc = await api.getProcess(processId);
    set({ map: proc.map, processMeta: proc });
    return proc;
  },

  /** Central mutation entry: records history + schedules autosave. */
  setMap(updater, { record = true } = {}) {
    const { map, past } = get();
    if (!map) return;
    const next = typeof updater === 'function' ? updater(map) : updater;
    if (next === map) return;
    set({
      map: next,
      past: record ? [...past.slice(-79), map] : past,
      future: record ? [] : get().future,
      saveState: 'dirty',
    });
    get().scheduleAutosave();
  },

  /** Replace map after a server round-trip (AI edit, restore, layout). */
  adoptServerMap(map) {
    const { map: cur, past } = get();
    set({ map, past: cur ? [...past.slice(-79), cur] : past, future: [], saveState: 'saved' });
  },

  undo() {
    const { past, future, map } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({ map: prev, past: past.slice(0, -1), future: [map, ...future].slice(0, 80), saveState: 'dirty' });
    get().scheduleAutosave();
  },

  redo() {
    const { past, future, map } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ map: next, past: [...past, map].slice(-80), future: future.slice(1), saveState: 'dirty' });
    get().scheduleAutosave();
  },

  _saveTimer: null,
  scheduleAutosave() {
    const t = get()._saveTimer;
    if (t) clearTimeout(t);
    set({ _saveTimer: setTimeout(() => get().saveNow(), 1200) });
  },

  async saveNow({ snapshot = false, versionLabel = '' } = {}) {
    const { processId, map, saveState } = get();
    if (!processId || !map || saveState === 'saving') return;
    set({ saveState: 'saving' });
    try {
      const res = await api.saveMap(processId, map, { snapshot, versionLabel });
      // Adopt server-normalised map only if user hasn't typed meanwhile.
      if (get().map === map) set({ map: res.map, saveState: 'saved' });
      else set({ saveState: 'dirty' });
    } catch (err) {
      set({ saveState: 'error' });
      get().toast(`Save failed: ${err.message}`, 'error');
    }
  },

  select(selection) {
    set({ selection });
  },

  toast(text, kind = 'info') {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4200);
  },
}));
