const STORAGE_KEY = 'dofusjob_state_v3';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      levels: state.levels,
      profileReady: state.profileReady,
      enabledJobs: [...state.enabledJobs],
      primaryJob: state.primaryJob,
      objective: state.objective,
      selectedResourceIds: [...state.selectedResourceIds],
      start: state.start,
      startMode: state.startMode,
      worldMap: state.worldMap,
      maxStops: state.maxStops,
      preferZaaps: state.preferZaaps,
      mapCenter: state.mapCenter,
      mapZoom: state.mapZoom
    })
  );
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
