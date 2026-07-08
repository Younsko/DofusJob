import './styles.css';
import {
  Check,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Fish,
  FlaskConical,
  Gauge,
  Import,
  LocateFixed,
  MapPinned,
  Maximize2,
  Navigation,
  Pickaxe,
  RefreshCcw,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TreePine,
  Upload,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut,
  createIcons
} from 'lucide';
import { JOB_ORDER, JOBS } from './data/jobs.js';
import { validateDataset } from './lib/dataset.js';
import { DOFUS_DATA } from './generated/dofusData.js';
import {
  buildRoute,
  coordLabel,
  exportRouteText,
  formatLegInstruction,
  getDefaultSelection,
  indexById,
  nearestZaap,
  summarizeStepResources,
  travelCommand
} from './lib/routePlanner.js';
import { clearState, loadState, saveState } from './lib/storage.js';

const ICONS = {
  Check,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Fish,
  FlaskConical,
  Gauge,
  Import,
  LocateFixed,
  MapPinned,
  Maximize2,
  Navigation,
  Pickaxe,
  RefreshCcw,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TreePine,
  Upload,
  Wheat,
  Zap,
  ZoomIn,
  ZoomOut
};

const DEFAULT_LEVELS = {
  miner: 80,
  lumberjack: 80,
  farmer: 80,
  alchemist: 80,
  fisherman: 80
};

const MAP_WIDTH = 1120;
const MAP_HEIGHT = 760;

const app = document.querySelector('#app');
const initialDataset = DOFUS_DATA;
let state = createInitialState();

function createInitialState() {
  const saved = loadState();
  const levels = { ...DEFAULT_LEVELS, ...(saved?.levels || {}) };
  const enabledJobs = new Set(saved?.enabledJobs || JOB_ORDER);
  const validResourceIds = new Set(initialDataset.resources.map((resource) => resource.id));
  const savedSelection = (saved?.selectedResourceIds || []).filter((id) => validResourceIds.has(id));
  const selectedResourceIds = new Set(
    savedSelection.length
      ? savedSelection
      : getDefaultSelection(initialDataset.resources, levels, enabledJobs)
  );

  return {
    dataset: initialDataset,
    levels,
    enabledJobs,
    selectedResourceIds,
    priorities: saved?.priorities || {},
    priorityMode: saved?.priorityMode || 'auto',
    start: saved?.start || { x: 5, y: -18 },
    worldMap: Number(saved?.worldMap || 1),
    maxStops: Number(saved?.maxStops || 12),
    preferZaaps: saved?.preferZaaps !== false,
    showZaaps: saved?.showZaaps !== false,
    showGrid: saved?.showGrid !== false,
    mapZoom: clampMapZoom(saved?.mapZoom || 1),
    mapFocus: normalizeMapFocus(saved?.mapFocus),
    search: '',
    focusedSpotId: null,
    notice: '',
    plan: null
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return entities[character];
  });
}

function clampMapZoom(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, numeric));
}

function normalizeMapFocus(focus) {
  if (!focus) return null;
  const x = Number(focus.x);
  const y = Number(focus.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function getResourceMap() {
  return indexById(state.dataset.resources);
}

function getCurrentSpots() {
  return state.dataset.spots.filter((spot) => Number(spot.worldMap || 1) === state.worldMap);
}

function getCurrentZaaps() {
  return state.dataset.zaaps.filter((zaap) => Number(zaap.worldMap || 1) === state.worldMap);
}

function getCurrentTransporters() {
  return (state.dataset.transporters || []).filter(
    (transporter) => Number(transporter.worldMap || 1) === state.worldMap
  );
}

function getCurrentTravelNodes() {
  return [...getCurrentZaaps(), ...getCurrentTransporters()];
}

function getCurrentMapCells() {
  return (state.dataset.maps || []).filter((map) => Number(map.worldMap || 1) === state.worldMap);
}

function getMapPoints() {
  return [
    state.start,
    ...getCurrentMapCells(),
    ...getCurrentZaaps(),
    ...getCurrentTransporters(),
    ...getCurrentSpots()
  ];
}

function getMapProjectionContext() {
  const bounds = getBounds(getMapPoints());
  const project = createProjector(bounds, MAP_WIDTH, MAP_HEIGHT);
  return { bounds, project, width: MAP_WIDTH, height: MAP_HEIGHT };
}

function getResourceStats() {
  const stats = new Map();
  for (const resource of state.dataset.resources) {
    stats.set(resource.id, { spotCount: 0, quantity: 0 });
  }

  for (const spot of getCurrentSpots()) {
    for (const [resourceId, quantity] of Object.entries(spot.resources || {})) {
      const item = stats.get(resourceId);
      if (!item) continue;
      item.spotCount += 1;
      item.quantity += Number(quantity) || 0;
    }
  }

  return stats;
}

function getVisibleResources() {
  const query = normalize(state.search);
  const stats = getResourceStats();

  return state.dataset.resources
    .filter((resource) => state.enabledJobs.has(resource.job))
    .filter((resource) => {
      if (!query) return true;
      const job = JOBS[resource.job]?.label || '';
      return normalize(`${resource.name} ${job} ${resource.family}`).includes(query);
    })
    .map((resource) => ({
      ...resource,
      stats: stats.get(resource.id) || { spotCount: 0, quantity: 0 },
      isAvailable: resource.level <= Number(state.levels[resource.job] || 1)
    }))
    .sort((a, b) => a.job.localeCompare(b.job) || a.level - b.level || a.name.localeCompare(b.name));
}

function computePlan() {
  state.plan = buildRoute({
    resources: state.dataset.resources,
    spots: getCurrentSpots(),
    zaaps: getCurrentTravelNodes(),
    selectedResourceIds: [...state.selectedResourceIds],
    levels: state.levels,
    priorities: state.priorities,
    priorityMode: state.priorityMode,
    start: state.start,
    maxStops: state.maxStops,
    preferZaaps: state.preferZaaps
  });
}

function render() {
  computePlan();
  saveState(state);

  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main class="planner">
        <aside class="panel panel-left">
          ${renderJobControls()}
          ${renderResourceControls()}
        </aside>
        <section class="map-workspace">
          ${renderToolbar()}
          ${renderMap()}
        </section>
        <aside class="panel panel-right">
          ${renderRouteSummary()}
          ${renderRouteSteps()}
        </aside>
      </main>
    </div>
  `;

  createIcons({ icons: ICONS });
  bindEvents();
}

function renderHeader() {
  const nearest = nearestZaap(state.start, getCurrentTravelNodes());
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark"><i data-lucide="route"></i></div>
        <div>
          <h1>DofusJob</h1>
          <p>${escapeHtml(state.dataset.meta?.label || 'Dataset local')} · ${state.plan?.candidates.length || 0} spots actifs</p>
        </div>
      </div>
      <div class="top-controls">
        <label class="field compact">
          <span>Depart X</span>
          <input id="start-x" type="number" value="${state.start.x}" />
        </label>
        <label class="field compact">
          <span>Depart Y</span>
          <input id="start-y" type="number" value="${state.start.y}" />
        </label>
        <label class="field compact">
          <span>Stops</span>
          <input id="max-stops" type="number" min="1" max="30" value="${state.maxStops}" />
        </label>
        <label class="field world-field">
          <span>Carte</span>
          <select id="world-map">
            ${renderWorldOptions()}
          </select>
        </label>
        <div class="nearest-zaap">
          <i data-lucide="zap"></i>
          <span>${nearest ? `${escapeHtml(nearest.name)} ${coordLabel(nearest)}` : 'Aucun transport'}</span>
        </div>
      </div>
    </header>
  `;
}

function renderWorldOptions() {
  return (state.dataset.worldMaps || [{ id: 1, name: 'Monde des Douze', mapCount: 0 }])
    .map(
      (worldMap) => `
        <option value="${worldMap.id}" ${Number(worldMap.id) === state.worldMap ? 'selected' : ''}>
          ${escapeHtml(worldMap.name)} (${worldMap.mapCount})
        </option>
      `
    )
    .join('');
}

function renderJobControls() {
  return `
    <section class="panel-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Profil</span>
          <h2>Metiers</h2>
        </div>
        <button class="icon-button" type="button" data-action="reset-app" title="Reinitialiser">
          <i data-lucide="refresh-ccw"></i>
        </button>
      </div>
      <div class="job-grid">
        ${JOB_ORDER.map((jobId) => renderJobControl(jobId)).join('')}
      </div>
      <div class="level-presets">
        <button type="button" class="mini-button" data-action="set-levels" data-level="60">60</button>
        <button type="button" class="mini-button" data-action="set-levels" data-level="120">120</button>
        <button type="button" class="mini-button" data-action="set-levels" data-level="200">200</button>
      </div>
    </section>
  `;
}

function renderJobControl(jobId) {
  const job = JOBS[jobId];
  const active = state.enabledJobs.has(jobId);
  return `
    <div class="job-row ${active ? 'is-active' : ''}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <button type="button" class="job-toggle" data-action="toggle-job" data-job="${jobId}" aria-pressed="${active}">
        <i data-lucide="${iconName(job.icon)}"></i>
        <span>${escapeHtml(job.label)}</span>
      </button>
      <input class="job-level" data-job="${jobId}" type="number" min="1" max="200" value="${state.levels[jobId]}" />
    </div>
  `;
}

function renderResourceControls() {
  const visible = getVisibleResources();
  return `
    <section class="panel-section resource-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Selection</span>
          <h2>Ressources</h2>
        </div>
        <div class="selection-count">${state.selectedResourceIds.size}</div>
      </div>
      <div class="search-line">
        <i data-lucide="search"></i>
        <input id="resource-search" type="search" placeholder="Filtrer" value="${escapeHtml(state.search)}" />
      </div>
      <div class="mode-row">
        <button type="button" class="segmented ${state.priorityMode === 'auto' ? 'is-active' : ''}" data-action="set-priority-mode" data-mode="auto">
          <i data-lucide="sparkles"></i>
          Auto
        </button>
        <button type="button" class="segmented ${state.priorityMode === 'manual' ? 'is-active' : ''}" data-action="set-priority-mode" data-mode="manual">
          <i data-lucide="sliders-horizontal"></i>
          Manuel
        </button>
      </div>
      <div class="quick-actions">
        <button type="button" class="text-button" data-action="auto-select">
          <i data-lucide="target"></i>
          Tranche actuelle
        </button>
        <button type="button" class="text-button" data-action="select-visible">
          <i data-lucide="check"></i>
          Visibles
        </button>
      </div>
      <div class="resource-list">
        ${visible.map((resource) => renderResourceRow(resource)).join('')}
      </div>
    </section>
  `;
}

function renderResourceRow(resource) {
  const selected = state.selectedResourceIds.has(resource.id);
  const job = JOBS[resource.job];
  const priority = Number(state.priorities[resource.id] || 3);
  return `
    <label class="resource-row ${selected ? 'is-selected' : ''} ${resource.isAvailable ? '' : 'is-locked'}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <input
        class="resource-toggle"
        data-resource-id="${resource.id}"
        type="checkbox"
        ${selected ? 'checked' : ''}
        ${resource.isAvailable ? '' : 'disabled'}
      />
      <span class="resource-dot">
        ${resource.icon ? `<img src="${escapeHtml(resource.icon)}" alt="" loading="lazy" />` : ''}
      </span>
      <span class="resource-main">
        <span class="resource-name">${escapeHtml(resource.name)}</span>
        <span class="resource-meta">Niv. ${resource.level} · ${resource.stats.spotCount} spots · ${resource.stats.quantity} unites</span>
      </span>
      ${
        state.priorityMode === 'manual' && selected
          ? `
            <span class="priority-control">
              <input class="priority-range" data-resource-id="${resource.id}" type="range" min="1" max="6" value="${priority}" />
              <output class="priority-value">${priority}</output>
            </span>
          `
          : `<span class="resource-level">${resource.level}</span>`
      }
    </label>
  `;
}

function renderToolbar() {
  const mapCount = getCurrentMapCells().length;
  const transporterCount = getCurrentTransporters().length;
  return `
    <div class="map-toolbar">
      <div class="map-tabs">
        <button type="button" class="tool-toggle ${state.preferZaaps ? 'is-active' : ''}" data-action="toggle-zaap-routing">
          <i data-lucide="zap"></i>
          Trajet rapide
        </button>
        <button type="button" class="tool-toggle ${state.showGrid ? 'is-active' : ''}" data-action="toggle-grid">
          <i data-lucide="${state.showGrid ? 'eye' : 'eye-off'}"></i>
          Grille
        </button>
        <button type="button" class="tool-toggle ${state.showZaaps ? 'is-active' : ''}" data-action="toggle-zaaps">
          <i data-lucide="map-pinned"></i>
          Zaaps + transports
        </button>
        <span class="map-count">${mapCount} cases · ${transporterCount} transporteurs</span>
      </div>
      <div class="map-actions">
        <div class="zoom-controls" aria-label="Zoom carte">
          <button type="button" class="icon-button" data-action="zoom-out" title="Dezoomer">
            <i data-lucide="zoom-out"></i>
          </button>
          <span class="zoom-readout">${Math.round(state.mapZoom * 100)}%</span>
          <button type="button" class="icon-button" data-action="zoom-in" title="Zoomer">
            <i data-lucide="zoom-in"></i>
          </button>
          <button type="button" class="icon-button" data-action="focus-route" title="Centrer la route">
            <i data-lucide="crosshair"></i>
          </button>
          <button type="button" class="icon-button" data-action="reset-map-view" title="Vue complete">
            <i data-lucide="maximize-2"></i>
          </button>
        </div>
        <input id="dataset-file" class="file-input" type="file" accept="application/json" />
        <label for="dataset-file" class="text-button">
          <i data-lucide="upload"></i>
          Import JSON
        </label>
        <button type="button" class="text-button" data-action="export-route">
          <i data-lucide="copy"></i>
          Copier route
        </button>
      </div>
    </div>
    ${state.notice ? `<div class="notice">${escapeHtml(state.notice)}</div>` : ''}
  `;
}

function renderRouteSummary() {
  const plan = state.plan;
  const topResources = plan.resources.slice(0, 6);
  return `
    <section class="panel-section">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Run</span>
          <h2>Itineraire</h2>
        </div>
        <div class="score-pill">
          <i data-lucide="gauge"></i>
          ${plan.totals.efficiency.toFixed(1)}
        </div>
      </div>
      <div class="metric-grid">
        <div>
          <span>${plan.route.length}</span>
          <small>stops</small>
        </div>
        <div>
          <span>${Math.round(plan.totals.walkCost)}</span>
          <small>cases</small>
        </div>
        <div>
          <span>${plan.totals.zaapCount}</span>
          <small>zaaps</small>
        </div>
        <div>
          <span>${Math.round(plan.totals.rawQuantity)}</span>
          <small>unites</small>
        </div>
      </div>
      <div class="priority-stack">
        ${topResources
          .map((resource, index) => {
            const job = JOBS[resource.job];
            return `
              <div class="priority-chip" style="--job-color:${job.color};--job-soft:${job.softColor}">
                <span>${index + 1}</span>
                ${escapeHtml(resource.name)}
              </div>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderRouteSteps() {
  const plan = state.plan;
  if (!plan.route.length) {
    return `
      <section class="panel-section route-section">
        <div class="empty-state">
          <i data-lucide="locate-fixed"></i>
          <strong>Aucune route active</strong>
          <span>Verifie les niveaux et les ressources cochees.</span>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel-section route-section">
      <div class="step-list">
        ${plan.route.map((step) => renderStep(step)).join('')}
      </div>
    </section>
  `;
}

function renderTravelCommandButton(point, className = '') {
  const command = travelCommand(point);
  return `
    <button type="button" class="command-pill ${className}" data-action="copy-travel" data-command="${escapeHtml(command)}" title="Copier ${escapeHtml(command)}">
      <i data-lucide="copy"></i>
      <span>${escapeHtml(command)}</span>
    </button>
  `;
}

function renderCoordButton(point) {
  const command = travelCommand(point);
  return `
    <button type="button" class="coord-button" data-action="copy-travel" data-command="${escapeHtml(command)}" title="Copier ${escapeHtml(command)}">
      ${coordLabel(point)}
    </button>
  `;
}

function getStepTravelLabel(step) {
  if (step.travel.mode === 'zaap') {
    return `via ${step.travel.originZaap.name} -> ${step.travel.targetZaap.name}`;
  }
  return 'marche directe';
}

function renderStep(step) {
  const focused = state.focusedSpotId === step.id;
  const dominantJob = getDominantJob(step);
  const job = JOBS[dominantJob] || JOBS.miner;
  return `
    <article class="step-row ${focused ? 'is-focused' : ''}" data-action="focus-spot" data-spot-id="${step.id}" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <div class="step-index">${step.index}</div>
      <div class="step-body">
        <div class="step-title">
          <strong>${escapeHtml(step.name)}</strong>
          ${renderCoordButton(step)}
        </div>
        <p>${escapeHtml(formatLegInstruction(step))}</p>
        <div class="step-command-row">
          ${renderTravelCommandButton(step)}
          <span class="travel-hint">${escapeHtml(getStepTravelLabel(step))}</span>
        </div>
        <div class="step-resources">${escapeHtml(summarizeStepResources(step))}</div>
        <div class="step-metrics">
          <span>${Math.round(step.travel.walkCost)} cases</span>
          <span>${step.travel.zaapCount ? 'zaap' : 'marche'}</span>
          <span>score ${step.value.toFixed(0)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMap() {
  const plan = state.plan;
  const resourceMap = getResourceMap();
  const routeIds = new Set(plan.route.map((step) => step.id));
  const candidateIds = new Set(plan.candidates.map((spot) => spot.id));
  const currentMapCells = getCurrentMapCells();
  const currentZaaps = getCurrentZaaps();
  const currentTransporters = getCurrentTransporters();
  const currentSpots = getCurrentSpots();
  const { bounds, project, width, height } = getMapProjectionContext();
  const viewBox = getMapViewBox(width, height, project);
  const grid = state.showGrid ? renderGrid(bounds, width, height, project) : '';
  const routeSegments = plan.route
    .flatMap((step) =>
      step.travel.segments.map((segment) => renderRouteSegment(segment, project))
    )
    .join('');
  const routePins = plan.route.map((step) => renderRoutePin(step, project)).join('');
  const zaaps = state.showZaaps
    ? [
        ...currentZaaps.map((zaap) => renderTravelMarker(zaap, project)),
        ...currentTransporters.map((transporter) => renderTravelMarker(transporter, project))
      ].join('')
    : '';
  const spots = currentSpots
    .map((spot) => renderSpotMarker(spot, project, resourceMap, candidateIds, routeIds))
    .join('');
  const mapCells = renderMapCells(currentMapCells, project, plan);
  const start = project(state.start);

  return `
    <div class="map-frame">
      <svg class="map-svg" viewBox="${viewBox}" role="img" aria-label="Carte DofusJob">
        <defs>
          <radialGradient id="waterGlow" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stop-color="#243d46" />
            <stop offset="58%" stop-color="#16262d" />
            <stop offset="100%" stop-color="#0d171b" />
          </radialGradient>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28" />
          </filter>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#waterGlow)" />
        ${grid}
        ${mapCells}
        <g class="map-spots">${spots}</g>
        <g class="map-zaaps">${zaaps}</g>
        <g class="map-route">${routeSegments}</g>
        <g class="map-route-pins">${routePins}</g>
        <g class="start-marker" transform="translate(${start.x} ${start.y})">
          <circle r="13"></circle>
          <path d="M0 -7 L6 7 L0 4 L-6 7 Z"></path>
          <title>Depart ${coordLabel(state.start)}</title>
        </g>
      </svg>
      ${renderFocusedSpot()}
    </div>
  `;
}

function getBounds(points) {
  const xs = points.map((point) => Number(point.x));
  const ys = points.map((point) => Number(point.y));
  return {
    minX: Math.min(...xs) - 8,
    maxX: Math.max(...xs) + 8,
    minY: Math.min(...ys) - 8,
    maxY: Math.max(...ys) + 8
  };
}

function createProjector(bounds, width, height) {
  const padding = 56;
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  return (point) => ({
    x: padding + ((Number(point.x) - bounds.minX) / rangeX) * (width - padding * 2),
    y: padding + ((Number(point.y) - bounds.minY) / rangeY) * (height - padding * 2)
  });
}

function unprojectMapPoint(point, bounds, width, height) {
  const padding = 56;
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;
  return {
    x: bounds.minX + ((point.x - padding) / (width - padding * 2)) * rangeX,
    y: bounds.minY + ((point.y - padding) / (height - padding * 2)) * rangeY
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMapViewBox(width, height, project) {
  const zoom = clampMapZoom(state.mapZoom);
  const viewWidth = width / zoom;
  const viewHeight = height / zoom;
  const center = state.mapFocus ? project(state.mapFocus) : { x: width / 2, y: height / 2 };
  const maxX = Math.max(0, width - viewWidth);
  const maxY = Math.max(0, height - viewHeight);
  const x = clamp(center.x - viewWidth / 2, 0, maxX);
  const y = clamp(center.y - viewHeight / 2, 0, maxY);

  return `${x.toFixed(2)} ${y.toFixed(2)} ${viewWidth.toFixed(2)} ${viewHeight.toFixed(2)}`;
}

function getSvgPoint(event, svg) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function renderGrid(bounds, width, height, project) {
  const lines = [];
  const minX = Math.ceil(bounds.minX / 10) * 10;
  const maxX = Math.floor(bounds.maxX / 10) * 10;
  const minY = Math.ceil(bounds.minY / 10) * 10;
  const maxY = Math.floor(bounds.maxY / 10) * 10;

  for (let x = minX; x <= maxX; x += 10) {
    const from = project({ x, y: bounds.minY });
    const to = project({ x, y: bounds.maxY });
    lines.push(`<line class="grid-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`);
    lines.push(`<text class="grid-label" x="${from.x + 4}" y="${height - 18}">${x}</text>`);
  }

  for (let y = minY; y <= maxY; y += 10) {
    const from = project({ x: bounds.minX, y });
    const to = project({ x: bounds.maxX, y });
    lines.push(`<line class="grid-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`);
    lines.push(`<text class="grid-label" x="16" y="${from.y - 4}">${y}</text>`);
  }

  return `<g class="map-grid">${lines.join('')}</g>`;
}

function renderMapCells(mapCells, project, plan) {
  const candidateSubareas = new Set(plan.candidates.map((spot) => spot.subareaId).filter(Boolean));
  const routeSubareas = new Set(plan.route.map((spot) => spot.subareaId).filter(Boolean));
  const sampleA = project({ x: 0, y: 0 });
  const sampleB = project({ x: 1, y: 1 });
  const size = Math.max(2.2, Math.min(7, Math.abs(sampleB.x - sampleA.x) * 0.72));
  const base = [];
  const harvestable = [];
  const route = [];

  for (const map of mapCells) {
    const point = project(map);
    const path = rectPath(point.x - size / 2, point.y - size / 2, size);
    base.push(path);
    if (candidateSubareas.has(map.subareaId)) harvestable.push(path);
    if (routeSubareas.has(map.subareaId)) route.push(path);
  }

  return `
    <g class="map-cells">
      <path class="map-cell-layer map-cell-base" d="${base.join(' ')}"></path>
      <path class="map-cell-layer map-cell-harvestable" d="${harvestable.join(' ')}"></path>
      <path class="map-cell-layer map-cell-route" d="${route.join(' ')}"></path>
    </g>
  `;
}

function rectPath(x, y, size) {
  return `M${x.toFixed(2)} ${y.toFixed(2)}h${size.toFixed(2)}v${size.toFixed(2)}h-${size.toFixed(2)}Z`;
}

function renderContinents(project) {
  const regions = [
    {
      className: 'region-amakna',
      label: 'Amakna',
      points: [
        [-12, -29],
        [18, -31],
        [26, -12],
        [16, 29],
        [-13, 33],
        [-26, 11],
        [-22, -12]
      ]
    },
    {
      className: 'region-cania',
      label: 'Cania',
      points: [
        [-39, -62],
        [-8, -57],
        [-3, -34],
        [-18, -14],
        [-39, -22],
        [-47, -45]
      ]
    },
    {
      className: 'region-frigost',
      label: 'Frigost',
      points: [
        [-88, -52],
        [-67, -54],
        [-59, -36],
        [-76, -27],
        [-92, -36]
      ]
    },
    {
      className: 'region-otomai',
      label: 'Otomai',
      points: [
        [-65, 7],
        [-43, 8],
        [-37, 29],
        [-52, 39],
        [-68, 28]
      ]
    },
    {
      className: 'region-pandala',
      label: 'Pandala',
      points: [
        [16, -45],
        [37, -42],
        [42, -26],
        [30, -16],
        [14, -24]
      ]
    },
    {
      className: 'region-south',
      label: 'Sud',
      points: [
        [-33, 18],
        [-15, 3],
        [2, 12],
        [4, 41],
        [-20, 47],
        [-38, 35]
      ]
    },
    {
      className: 'region-moon',
      label: 'Moon',
      points: [
        [25, 3],
        [42, 4],
        [49, 19],
        [38, 31],
        [23, 23]
      ]
    }
  ];

  return regions
    .map((region) => {
      const points = region.points.map(([x, y]) => project({ x, y }));
      const polygon = points.map((point) => `${point.x},${point.y}`).join(' ');
      const center = points.reduce(
        (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
        { x: 0, y: 0 }
      );
      return `
        <g class="continent ${region.className}" filter="url(#softShadow)">
          <polygon points="${polygon}" />
          <text x="${center.x}" y="${center.y}">${region.label}</text>
        </g>
      `;
    })
    .join('');
}

function renderSpotMarker(spot, project, resourceMap, candidateIds, routeIds) {
  const point = project(spot);
  const dominantJob = getDominantJob(spot);
  const job = JOBS[dominantJob] || JOBS.miner;
  const isCandidate = candidateIds.has(spot.id);
  const isRoute = routeIds.has(spot.id);
  const isFocused = state.focusedSpotId === spot.id;
  const quantity = Object.values(spot.resources || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const radius = isRoute ? 11 : isCandidate ? Math.min(10, 5 + quantity / 7) : 4;
  const className = [
    'spot-marker',
    isCandidate ? 'is-candidate' : 'is-muted',
    isRoute ? 'is-route' : '',
    isFocused ? 'is-focused' : ''
  ].join(' ');
  const title = getSpotTitle(spot, resourceMap);

  return `
    <g class="${className}" data-action="focus-spot" data-spot-id="${spot.id}" transform="translate(${point.x} ${point.y})" style="--job-color:${job.color};--job-soft:${job.softColor}">
      <circle r="${radius}"></circle>
      <title>${escapeHtml(title)}</title>
    </g>
  `;
}

function renderTravelMarker(node, project) {
  const point = project(node);
  const isTransporter = node.type === 'transporter';
  return `
    <g class="${isTransporter ? 'transporter-marker' : 'zaap-marker'}" transform="translate(${point.x} ${point.y})">
      ${
        isTransporter
          ? '<path d="M-9 -8 H9 L5 9 H-5 Z"></path><circle r="3"></circle>'
          : '<path d="M0 -9 L9 0 L0 9 L-9 0 Z"></path><circle r="3"></circle>'
      }
      <title>${escapeHtml(node.name)} ${coordLabel(node)}</title>
    </g>
  `;
}

function renderRouteSegment(segment, project) {
  const from = project(segment.from);
  const to = project(segment.to);
  const className = segment.mode === 'zaap' ? 'route-line route-line-zaap' : 'route-line route-line-walk';
  return `<line class="${className}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
}

function renderRoutePin(step, project) {
  const point = project(step);
  const command = travelCommand(step);
  return `
    <g class="route-pin" data-action="focus-spot" data-spot-id="${step.id}" transform="translate(${point.x} ${point.y})">
      <circle r="15"></circle>
      <text y="5">${step.index}</text>
      <title>${escapeHtml(command)} - ${escapeHtml(step.name)}</title>
    </g>
  `;
}

function renderFocusedSpot() {
  const spot = getCurrentSpots().find((item) => item.id === state.focusedSpotId) || state.plan.route[0];
  if (!spot) return '';
  const resourceMap = getResourceMap();
  const resources = Object.entries(spot.resources || {})
    .map(([resourceId, quantity]) => {
      const resource = resourceMap.get(resourceId);
      if (!resource) return '';
      const job = JOBS[resource.job];
      const active = state.selectedResourceIds.has(resourceId) && resource.level <= state.levels[resource.job];
      return `
        <span class="spot-resource ${active ? 'is-active' : ''}" style="--job-color:${job.color};--job-soft:${job.softColor}">
          ${escapeHtml(resource.name)} x${quantity}
        </span>
      `;
    })
    .join('');

  return `
    <div class="spot-popover">
      <div>
        <span class="eyebrow">${escapeHtml(spot.zone || 'Zone')}</span>
        <strong>${escapeHtml(spot.name)}</strong>
      </div>
      ${renderTravelCommandButton(spot, 'popover-command')}
      <div class="spot-resource-list">${resources}</div>
    </div>
  `;
}

function getDominantJob(spot) {
  const resourceMap = getResourceMap();
  const totals = {};

  for (const [resourceId, quantity] of Object.entries(spot.resources || {})) {
    const resource = resourceMap.get(resourceId);
    if (!resource) continue;
    totals[resource.job] = (totals[resource.job] || 0) + Number(quantity || 0);
  }

  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'miner';
}

function getSpotTitle(spot, resourceMap) {
  const resources = Object.entries(spot.resources || {})
    .map(([resourceId, quantity]) => {
      const resource = resourceMap.get(resourceId);
      return resource ? `${resource.name} x${quantity}` : `${resourceId} x${quantity}`;
    })
    .join(', ');

  return `${spot.name} ${coordLabel(spot)} · ${resources}`;
}

function iconName(name) {
  return name.replace(/[A-Z]/g, (match, index) => `${index ? '-' : ''}${match.toLowerCase()}`);
}

function bindEvents() {
  app.querySelector('#start-x')?.addEventListener('change', (event) => {
    state.start.x = Number(event.target.value || 0);
    rerender();
  });
  app.querySelector('#start-y')?.addEventListener('change', (event) => {
    state.start.y = Number(event.target.value || 0);
    rerender();
  });
  app.querySelector('#max-stops')?.addEventListener('change', (event) => {
    state.maxStops = Math.min(30, Math.max(1, Number(event.target.value || 12)));
    rerender();
  });
  app.querySelector('#world-map')?.addEventListener('change', (event) => {
    state.worldMap = Number(event.target.value || 1);
    state.focusedSpotId = null;
    state.mapFocus = null;
    state.mapZoom = 1;
    rerender();
  });
  app.querySelector('#resource-search')?.addEventListener('input', (event) => {
    state.search = event.target.value;
    rerender(false);
    requestAnimationFrame(() => {
      const input = app.querySelector('#resource-search');
      input?.focus();
      input?.setSelectionRange(state.search.length, state.search.length);
    });
  });
  app.querySelector('#dataset-file')?.addEventListener('change', handleDatasetImport);

  app.querySelectorAll('.job-level').forEach((input) => {
    input.addEventListener('change', (event) => {
      const jobId = event.currentTarget.dataset.job;
      state.levels[jobId] = Math.min(200, Math.max(1, Number(event.currentTarget.value || 1)));
      pruneUnavailableSelection();
      rerender();
    });
  });

  app.querySelectorAll('.resource-toggle').forEach((input) => {
    input.addEventListener('change', (event) => {
      const resourceId = event.currentTarget.dataset.resourceId;
      if (event.currentTarget.checked) {
        state.selectedResourceIds.add(resourceId);
      } else {
        state.selectedResourceIds.delete(resourceId);
      }
      rerender(true, { preserveScroll: true });
    });
  });

  app.querySelectorAll('.priority-range').forEach((input) => {
    input.addEventListener('input', (event) => {
      const value = Number(event.currentTarget.value);
      state.priorities[event.currentTarget.dataset.resourceId] = value;
      event.currentTarget
        .closest('.priority-control')
        ?.querySelector('.priority-value')
        ?.replaceChildren(String(value));
      saveState(state);
    });
    input.addEventListener('change', () => {
      rerender(true, { preserveScroll: true });
    });
  });

  app.querySelector('.map-svg')?.addEventListener('wheel', handleMapWheel, { passive: false });

  app.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', handleAction);
  });
}

function handleMapWheel(event) {
  event.preventDefault();
  const svg = event.currentTarget;
  const { bounds, width, height } = getMapProjectionContext();
  const svgPoint = getSvgPoint(event, svg);
  const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;

  state.mapFocus = unprojectMapPoint(svgPoint, bounds, width, height);
  state.mapZoom = clampMapZoom(state.mapZoom * factor);
  rerender(true, { preserveScroll: true });
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (!action) return;

  if (action === 'copy-travel') {
    event.stopPropagation();
    copyTravel(event.currentTarget.dataset.command);
    return;
  }

  if (action === 'toggle-job') {
    const jobId = event.currentTarget.dataset.job;
    if (state.enabledJobs.has(jobId)) {
      state.enabledJobs.delete(jobId);
      for (const resource of state.dataset.resources.filter((item) => item.job === jobId)) {
        state.selectedResourceIds.delete(resource.id);
      }
    } else {
      state.enabledJobs.add(jobId);
      for (const resourceId of getDefaultSelection(state.dataset.resources, state.levels, [jobId])) {
        state.selectedResourceIds.add(resourceId);
      }
    }
    if (!state.enabledJobs.size) state.enabledJobs.add(jobId);
    rerender();
    return;
  }

  if (action === 'set-levels') {
    const level = Number(event.currentTarget.dataset.level || 80);
    for (const jobId of JOB_ORDER) state.levels[jobId] = level;
    state.selectedResourceIds = new Set(getDefaultSelection(state.dataset.resources, state.levels, state.enabledJobs));
    rerender();
    return;
  }

  if (action === 'set-priority-mode') {
    state.priorityMode = event.currentTarget.dataset.mode;
    rerender();
    return;
  }

  if (action === 'auto-select') {
    state.selectedResourceIds = new Set(getDefaultSelection(state.dataset.resources, state.levels, state.enabledJobs));
    rerender();
    return;
  }

  if (action === 'select-visible') {
    for (const resource of getVisibleResources().filter((item) => item.isAvailable)) {
      state.selectedResourceIds.add(resource.id);
    }
    rerender();
    return;
  }

  if (action === 'toggle-zaap-routing') {
    state.preferZaaps = !state.preferZaaps;
    rerender();
    return;
  }

  if (action === 'toggle-grid') {
    state.showGrid = !state.showGrid;
    rerender();
    return;
  }

  if (action === 'toggle-zaaps') {
    state.showZaaps = !state.showZaaps;
    rerender();
    return;
  }

  if (action === 'zoom-in') {
    state.mapZoom = clampMapZoom(state.mapZoom * 1.25);
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'zoom-out') {
    state.mapZoom = clampMapZoom(state.mapZoom / 1.25);
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'focus-route') {
    focusRoute();
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'reset-map-view') {
    state.mapZoom = 1;
    state.mapFocus = null;
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'focus-spot') {
    focusSpot(event.currentTarget.dataset.spotId);
    rerender(true, { preserveScroll: true });
    return;
  }

  if (action === 'export-route') {
    copyRoute();
    return;
  }

  if (action === 'reset-app') {
    clearState();
    state = createInitialState();
    rerender();
  }
}

function focusSpot(spotId) {
  state.focusedSpotId = spotId;
  const spot = getCurrentSpots().find((item) => item.id === spotId) || state.plan.route.find((item) => item.id === spotId);
  if (!spot) return;
  state.mapFocus = { x: Number(spot.x), y: Number(spot.y) };
  state.mapZoom = Math.max(state.mapZoom, 2.2);
}

function focusRoute() {
  const points = [state.start, ...state.plan.route];
  if (!points.length) return;
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + Number(point.x) / points.length,
      y: sum.y + Number(point.y) / points.length
    }),
    { x: 0, y: 0 }
  );

  state.mapFocus = center;
  state.mapZoom = Math.max(state.mapZoom, 1.55);
}

async function handleDatasetImport(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = validateDataset(JSON.parse(text));
    state.dataset = imported;
    state.enabledJobs = new Set(JOB_ORDER.filter((jobId) => imported.resources.some((resource) => resource.job === jobId)));
    state.selectedResourceIds = new Set(getDefaultSelection(imported.resources, state.levels, state.enabledJobs));
    state.focusedSpotId = null;
    state.mapFocus = null;
    state.mapZoom = 1;
    state.notice = `Import charge: ${imported.resources.length} ressources, ${imported.spots.length} spots.`;
  } catch (error) {
    state.notice = error.message || 'Import impossible.';
  }

  rerender();
}

function pruneUnavailableSelection() {
  const resourceMap = getResourceMap();
  for (const resourceId of [...state.selectedResourceIds]) {
    const resource = resourceMap.get(resourceId);
    if (!resource) {
      state.selectedResourceIds.delete(resourceId);
      continue;
    }
    if (resource.level > Number(state.levels[resource.job] || 1)) {
      state.selectedResourceIds.delete(resourceId);
    }
  }
}

function captureScrollSnapshot() {
  return {
    windowX: window.scrollX,
    windowY: window.scrollY,
    leftPanel: app.querySelector('.panel-left')?.scrollTop || 0,
    rightPanel: app.querySelector('.panel-right')?.scrollTop || 0,
    resourceList: app.querySelector('.resource-list')?.scrollTop || 0
  };
}

function restoreScrollSnapshot(snapshot) {
  if (!snapshot) return;
  const restore = () => {
    const leftPanel = app.querySelector('.panel-left');
    const rightPanel = app.querySelector('.panel-right');
    const resourceList = app.querySelector('.resource-list');

    if (leftPanel) leftPanel.scrollTop = snapshot.leftPanel;
    if (rightPanel) rightPanel.scrollTop = snapshot.rightPanel;
    if (resourceList) resourceList.scrollTop = snapshot.resourceList;
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 80);
  });
}

function rerender(clearNotice = true, options = {}) {
  const scrollSnapshot = options.preserveScroll ? captureScrollSnapshot() : null;
  if (clearNotice) state.notice = '';
  render();
  restoreScrollSnapshot(scrollSnapshot);
}

async function copyRoute() {
  const text = exportRouteText(state.plan);
  const copied = await copyText(text, 'dofusjob-route.txt');
  state.notice = copied ? 'Route copiee avec commandes /travel.' : 'Route telechargee.';
  rerender(false, { preserveScroll: true });
}

async function copyTravel(command) {
  if (!command) return;
  const copied = await copyText(command, 'dofusjob-travel.txt');
  state.notice = copied ? `${command} copie.` : 'Commande telechargee.';
  rerender(false, { preserveScroll: true });
}

async function copyText(text, filename) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    downloadText(filename, text);
    return false;
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

render();
