import { DATASET_META, RESOURCES, RESOURCE_SPOTS } from '../data/resources.js';
import { ZAAPS } from '../data/zaaps.js';

export function getSeedDataset() {
  return {
    meta: DATASET_META,
    resources: RESOURCES,
    spots: RESOURCE_SPOTS,
    zaaps: ZAAPS
  };
}

export function validateDataset(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Le fichier importe doit etre un objet JSON.');
  }

  const resources = Array.isArray(payload.resources) ? payload.resources : null;
  const spots = Array.isArray(payload.spots) ? payload.spots : null;
  const zaaps = Array.isArray(payload.zaaps) ? payload.zaaps : null;

  if (!resources || !spots || !zaaps) {
    throw new Error('Format attendu: { resources: [], spots: [], zaaps: [] }.');
  }

  for (const resource of resources) {
    if (!resource.id || !resource.name || !resource.job || !Number.isFinite(Number(resource.level))) {
      throw new Error('Chaque ressource doit avoir id, name, job et level.');
    }
  }

  for (const spot of spots) {
    if (!spot.id || !spot.name || !Number.isFinite(Number(spot.x)) || !Number.isFinite(Number(spot.y))) {
      throw new Error('Chaque spot doit avoir id, name, x et y.');
    }
    if (!spot.resources || typeof spot.resources !== 'object') {
      throw new Error(`Le spot ${spot.id} doit avoir un objet resources.`);
    }
  }

  for (const zaap of zaaps) {
    if (!zaap.id || !zaap.name || !Number.isFinite(Number(zaap.x)) || !Number.isFinite(Number(zaap.y))) {
      throw new Error('Chaque zaap doit avoir id, name, x et y.');
    }
  }

  return {
    meta: payload.meta || { id: 'custom-import', label: 'Import JSON' },
    resources,
    spots,
    zaaps
  };
}

