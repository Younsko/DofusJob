const STORAGE_KEY = 'dofusjob_state_v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  const snapshot = {
    levels: state.levels,
    enabledJobs: [...state.enabledJobs],
    selectedResourceIds: [...state.selectedResourceIds],
    priorities: state.priorities,
    priorityMode: state.priorityMode,
    start: state.start,
    worldMap: state.worldMap,
    maxStops: state.maxStops,
    preferZaaps: state.preferZaaps,
    showZaaps: state.showZaaps,
    showGrid: state.showGrid,
    mapZoom: state.mapZoom,
    mapFocus: state.mapFocus
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
