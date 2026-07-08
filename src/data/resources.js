export const RESOURCES = [
  { id: 'iron', name: 'Fer', job: 'miner', level: 1, family: 'Minerais' },
  { id: 'copper', name: 'Cuivre', job: 'miner', level: 20, family: 'Minerais' },
  { id: 'bronze', name: 'Bronze', job: 'miner', level: 40, family: 'Minerais' },
  { id: 'cobalt', name: 'Kobalte', job: 'miner', level: 60, family: 'Minerais' },
  { id: 'manganese', name: 'Manganese', job: 'miner', level: 80, family: 'Minerais' },
  { id: 'tin', name: 'Etain', job: 'miner', level: 100, family: 'Minerais' },
  { id: 'silicate', name: 'Silicate', job: 'miner', level: 100, family: 'Minerais' },
  { id: 'silver', name: 'Argent', job: 'miner', level: 120, family: 'Minerais' },
  { id: 'bauxite', name: 'Bauxite', job: 'miner', level: 140, family: 'Minerais' },
  { id: 'gold', name: 'Or', job: 'miner', level: 160, family: 'Minerais' },
  { id: 'dolomite', name: 'Dolomite', job: 'miner', level: 180, family: 'Minerais' },
  { id: 'obsidian', name: 'Obsidienne', job: 'miner', level: 200, family: 'Minerais' },

  { id: 'ash', name: 'Frene', job: 'lumberjack', level: 1, family: 'Bois' },
  { id: 'chestnut', name: 'Chataignier', job: 'lumberjack', level: 20, family: 'Bois' },
  { id: 'walnut', name: 'Noyer', job: 'lumberjack', level: 40, family: 'Bois' },
  { id: 'oak', name: 'Chene', job: 'lumberjack', level: 60, family: 'Bois' },
  { id: 'bombu', name: 'Bombu', job: 'lumberjack', level: 70, family: 'Bois' },
  { id: 'maple', name: 'Erable', job: 'lumberjack', level: 80, family: 'Bois' },
  { id: 'yew', name: 'If', job: 'lumberjack', level: 100, family: 'Bois' },
  { id: 'bamboo', name: 'Bambou', job: 'lumberjack', level: 110, family: 'Bois' },
  { id: 'cherry', name: 'Merisier', job: 'lumberjack', level: 120, family: 'Bois' },
  { id: 'hazel', name: 'Noisetier', job: 'lumberjack', level: 130, family: 'Bois' },
  { id: 'ebony', name: 'Ebene', job: 'lumberjack', level: 140, family: 'Bois' },
  { id: 'kaliptus', name: 'Kaliptus', job: 'lumberjack', level: 150, family: 'Bois' },
  { id: 'hornbeam', name: 'Charme', job: 'lumberjack', level: 160, family: 'Bois' },
  { id: 'elm', name: 'Orme', job: 'lumberjack', level: 180, family: 'Bois' },
  { id: 'aspen', name: 'Tremble', job: 'lumberjack', level: 200, family: 'Bois' },

  { id: 'wheat', name: 'Ble', job: 'farmer', level: 1, family: 'Cereales' },
  { id: 'barley', name: 'Orge', job: 'farmer', level: 20, family: 'Cereales' },
  { id: 'oats', name: 'Avoine', job: 'farmer', level: 40, family: 'Cereales' },
  { id: 'hop', name: 'Houblon', job: 'farmer', level: 60, family: 'Cereales' },
  { id: 'flax', name: 'Lin', job: 'farmer', level: 80, family: 'Cereales' },
  { id: 'rye', name: 'Seigle', job: 'farmer', level: 100, family: 'Cereales' },
  { id: 'rice', name: 'Riz', job: 'farmer', level: 120, family: 'Cereales' },
  { id: 'malt', name: 'Malt', job: 'farmer', level: 140, family: 'Cereales' },
  { id: 'hemp', name: 'Chanvre', job: 'farmer', level: 160, family: 'Cereales' },
  { id: 'corn', name: 'Mais', job: 'farmer', level: 180, family: 'Cereales' },
  { id: 'millet', name: 'Millet', job: 'farmer', level: 200, family: 'Cereales' },

  { id: 'nettle', name: 'Ortie', job: 'alchemist', level: 1, family: 'Plantes' },
  { id: 'sage', name: 'Sauge', job: 'alchemist', level: 20, family: 'Plantes' },
  { id: 'clover', name: 'Trefle a 5 feuilles', job: 'alchemist', level: 40, family: 'Plantes' },
  { id: 'mint', name: 'Menthe Sauvage', job: 'alchemist', level: 60, family: 'Plantes' },
  { id: 'orchid', name: 'Orchidee Freyesque', job: 'alchemist', level: 80, family: 'Plantes' },
  { id: 'edelweiss', name: 'Edelweiss', job: 'alchemist', level: 100, family: 'Plantes' },
  { id: 'pandkin', name: 'Graine de Pandouille', job: 'alchemist', level: 120, family: 'Plantes' },
  { id: 'ginseng', name: 'Ginseng', job: 'alchemist', level: 140, family: 'Plantes' },
  { id: 'belladonna', name: 'Belladone', job: 'alchemist', level: 160, family: 'Plantes' },
  { id: 'mandrake', name: 'Mandragore', job: 'alchemist', level: 180, family: 'Plantes' },
  { id: 'snowdrop', name: 'Perce-neige', job: 'alchemist', level: 200, family: 'Plantes' },

  { id: 'gudgeon', name: 'Goujon', job: 'fisherman', level: 1, family: 'Poissons' },
  { id: 'shrimp', name: 'Greuvette', job: 'fisherman', level: 10, family: 'Poissons' },
  { id: 'trout', name: 'Truite', job: 'fisherman', level: 20, family: 'Poissons' },
  { id: 'crab', name: 'Crabe', job: 'fisherman', level: 40, family: 'Poissons' },
  { id: 'kittenfish', name: 'Poisson-Chaton', job: 'fisherman', level: 60, family: 'Poissons' },
  { id: 'breaded-fish', name: 'Poisson Pane', job: 'fisherman', level: 80, family: 'Poissons' },
  { id: 'carp', name: 'Carpe d Iem', job: 'fisherman', level: 100, family: 'Poissons' },
  { id: 'sardine', name: 'Sardine Brillante', job: 'fisherman', level: 120, family: 'Poissons' },
  { id: 'pike', name: 'Brochet', job: 'fisherman', level: 140, family: 'Poissons' },
  { id: 'kralove', name: 'Kralamoure', job: 'fisherman', level: 160, family: 'Poissons' },
  { id: 'eel', name: 'Anguille', job: 'fisherman', level: 180, family: 'Poissons' },
  { id: 'perch', name: 'Perche', job: 'fisherman', level: 200, family: 'Poissons' }
];

export const RESOURCE_SPOTS = [
  {
    id: 'astrub-mine-center',
    name: 'Mine du centre d Astrub',
    zone: 'Astrub',
    kind: 'mine',
    x: 5,
    y: -19,
    quality: 0.78,
    resources: { iron: 11, copper: 5, bronze: 2 }
  },
  {
    id: 'astrub-mine-east',
    name: 'Mine est d Astrub',
    zone: 'Astrub',
    kind: 'mine',
    x: 9,
    y: -23,
    quality: 0.68,
    resources: { iron: 8, copper: 4, bronze: 3 }
  },
  {
    id: 'crackler-mountain-mine',
    name: 'Mine des Craqueleurs',
    zone: 'Montagne des Craqueleurs',
    kind: 'mine',
    x: -3,
    y: -7,
    quality: 0.86,
    resources: { iron: 5, copper: 7, bronze: 6, cobalt: 4, manganese: 2 }
  },
  {
    id: 'koalak-low-mine',
    name: 'Grotte basse des Koalaks',
    zone: 'Koalaks',
    kind: 'mine',
    x: -16,
    y: 9,
    quality: 0.82,
    resources: { cobalt: 5, manganese: 5, tin: 3, silicate: 2, bombu: 2 }
  },
  {
    id: 'cania-lake-mine',
    name: 'Mine du lac de Cania',
    zone: 'Cania',
    kind: 'mine',
    x: -24,
    y: -36,
    quality: 0.84,
    resources: { bronze: 4, cobalt: 5, manganese: 6, tin: 4, silver: 2 }
  },
  {
    id: 'sidimote-gallery',
    name: 'Galeries de Sidimote',
    zone: 'Sidimote',
    kind: 'mine',
    x: -19,
    y: 22,
    quality: 0.9,
    resources: { tin: 4, silicate: 4, silver: 5, bauxite: 4, gold: 2 }
  },
  {
    id: 'brakmar-sewer-mine',
    name: 'Egouts miniers de Brakmar',
    zone: 'Brakmar',
    kind: 'mine',
    x: -25,
    y: 35,
    quality: 0.76,
    resources: { silver: 3, bauxite: 5, gold: 4, dolomite: 1 }
  },
  {
    id: 'frigost-frozen-grotto',
    name: 'Grottes gelees',
    zone: 'Frigost',
    kind: 'mine',
    x: -77,
    y: -44,
    quality: 0.92,
    resources: { bauxite: 3, gold: 3, dolomite: 5, obsidian: 4, snowdrop: 3 }
  },
  {
    id: 'astrub-forest-west',
    name: 'Foret d Astrub ouest',
    zone: 'Astrub',
    kind: 'forest',
    x: -2,
    y: -22,
    quality: 0.72,
    resources: { ash: 12, chestnut: 6, nettle: 5, sage: 3 }
  },
  {
    id: 'astrub-forest-north',
    name: 'Bois nord d Astrub',
    zone: 'Astrub',
    kind: 'forest',
    x: 3,
    y: -28,
    quality: 0.7,
    resources: { ash: 10, chestnut: 5, walnut: 3, nettle: 4, clover: 2 }
  },
  {
    id: 'amakna-forest-edge',
    name: 'Lisiere d Amakna',
    zone: 'Amakna',
    kind: 'forest',
    x: -4,
    y: 3,
    quality: 0.8,
    resources: { chestnut: 5, walnut: 6, oak: 5, sage: 3, clover: 4 }
  },
  {
    id: 'cania-forest',
    name: 'Foret de Cania',
    zone: 'Cania',
    kind: 'forest',
    x: -21,
    y: -18,
    quality: 0.85,
    resources: { walnut: 5, oak: 5, maple: 6, yew: 3, orchid: 4 }
  },
  {
    id: 'dark-treechnid-path',
    name: 'Orée des Abraknydes',
    zone: 'Abraknydes',
    kind: 'forest',
    x: -10,
    y: -13,
    quality: 0.88,
    resources: { oak: 5, maple: 5, yew: 4, cherry: 3, edelweiss: 2 }
  },
  {
    id: 'pandala-bamboo-grove',
    name: 'Bambouseraie de Pandala',
    zone: 'Pandala',
    kind: 'forest',
    x: 24,
    y: -34,
    quality: 0.91,
    resources: { bamboo: 8, cherry: 4, rice: 6, pandkin: 4, ginseng: 2 }
  },
  {
    id: 'otomai-canopy-wood',
    name: 'Canopée d Otomai',
    zone: 'Otomai',
    kind: 'forest',
    x: -55,
    y: 16,
    quality: 0.9,
    resources: { hazel: 4, ebony: 5, kaliptus: 7, hornbeam: 3, belladonna: 3 }
  },
  {
    id: 'frigost-pineline',
    name: 'Bois froid de Frigost',
    zone: 'Frigost',
    kind: 'forest',
    x: -73,
    y: -39,
    quality: 0.86,
    resources: { hornbeam: 4, elm: 5, aspen: 4, snowdrop: 5 }
  },
  {
    id: 'astrub-fields',
    name: 'Champs d Astrub',
    zone: 'Astrub',
    kind: 'field',
    x: 7,
    y: -25,
    quality: 0.76,
    resources: { wheat: 12, barley: 7, oats: 4, nettle: 3 }
  },
  {
    id: 'amakna-fields',
    name: 'Champs d Amakna',
    zone: 'Amakna',
    kind: 'field',
    x: 5,
    y: 6,
    quality: 0.83,
    resources: { wheat: 8, barley: 7, oats: 6, hop: 5, flax: 2 }
  },
  {
    id: 'bonta-fields',
    name: 'Plaines agricoles de Bonta',
    zone: 'Bonta',
    kind: 'field',
    x: -31,
    y: -55,
    quality: 0.82,
    resources: { barley: 5, oats: 6, hop: 5, flax: 5, rye: 2 }
  },
  {
    id: 'scaraleaf-flax',
    name: 'Plaine des Scarafeuilles',
    zone: 'Amakna',
    kind: 'field',
    x: -1,
    y: 24,
    quality: 0.86,
    resources: { flax: 7, rye: 6, clover: 4, mint: 5, orchid: 3 }
  },
  {
    id: 'sufokia-rice-polders',
    name: 'Polders de Sufokia',
    zone: 'Sufokia',
    kind: 'field',
    x: 14,
    y: 25,
    quality: 0.88,
    resources: { rice: 7, malt: 5, hemp: 4, gudgeon: 4, shrimp: 4 }
  },
  {
    id: 'cania-grain-loop',
    name: 'Boucle des cereales de Cania',
    zone: 'Cania',
    kind: 'field',
    x: -18,
    y: -28,
    quality: 0.84,
    resources: { rye: 5, malt: 6, hemp: 5, corn: 3, mint: 3 }
  },
  {
    id: 'moon-corn-strip',
    name: 'Bande fertile de Moon',
    zone: 'Moon',
    kind: 'field',
    x: 32,
    y: 11,
    quality: 0.78,
    resources: { hemp: 4, corn: 5, millet: 3, hornbeam: 2 }
  },
  {
    id: 'astrub-herbal-ring',
    name: 'Anneau d herbes d Astrub',
    zone: 'Astrub',
    kind: 'herb',
    x: 1,
    y: -20,
    quality: 0.73,
    resources: { nettle: 8, sage: 6, clover: 4, ash: 2 }
  },
  {
    id: 'amakna-river-herbs',
    name: 'Herbes de la riviere d Amakna',
    zone: 'Amakna',
    kind: 'herb',
    x: 3,
    y: 1,
    quality: 0.78,
    resources: { sage: 6, clover: 5, mint: 4, wheat: 3 }
  },
  {
    id: 'koalak-orchids',
    name: 'Orchidees des Koalaks',
    zone: 'Koalaks',
    kind: 'herb',
    x: -15,
    y: 7,
    quality: 0.8,
    resources: { mint: 5, orchid: 6, edelweiss: 4, bombu: 3 }
  },
  {
    id: 'pandala-seed-path',
    name: 'Sentier de Pandouille',
    zone: 'Pandala',
    kind: 'herb',
    x: 27,
    y: -32,
    quality: 0.89,
    resources: { pandkin: 6, ginseng: 5, rice: 4, bamboo: 3 }
  },
  {
    id: 'otomai-toxic-garden',
    name: 'Jardin toxique d Otomai',
    zone: 'Otomai',
    kind: 'herb',
    x: -53,
    y: 20,
    quality: 0.9,
    resources: { ginseng: 4, belladonna: 6, mandrake: 4, kaliptus: 3 }
  },
  {
    id: 'frigost-whitebeds',
    name: 'Parterres blancs de Frigost',
    zone: 'Frigost',
    kind: 'herb',
    x: -80,
    y: -40,
    quality: 0.93,
    resources: { mandrake: 4, snowdrop: 7, dolomite: 2, obsidian: 2 }
  },
  {
    id: 'madrestam-docks',
    name: 'Docks de Madrestam',
    zone: 'Amakna',
    kind: 'shore',
    x: 7,
    y: -5,
    quality: 0.77,
    resources: { gudgeon: 8, shrimp: 6, trout: 4, crab: 2 }
  },
  {
    id: 'sufokia-reef',
    name: 'Recifs de Sufokia',
    zone: 'Sufokia',
    kind: 'shore',
    x: 16,
    y: 27,
    quality: 0.86,
    resources: { trout: 4, crab: 5, kittenfish: 5, 'breaded-fish': 3, carp: 2 }
  },
  {
    id: 'cania-lake-fishing',
    name: 'Lac de Cania',
    zone: 'Cania',
    kind: 'shore',
    x: -22,
    y: -33,
    quality: 0.84,
    resources: { crab: 4, kittenfish: 5, carp: 4, sardine: 2 }
  },
  {
    id: 'otomai-coast',
    name: 'Cote d Otomai',
    zone: 'Otomai',
    kind: 'shore',
    x: -48,
    y: 25,
    quality: 0.88,
    resources: { carp: 4, sardine: 5, pike: 4, kralove: 2 }
  },
  {
    id: 'frigost-harbor',
    name: 'Port glace de Frigost',
    zone: 'Frigost',
    kind: 'shore',
    x: -78,
    y: -38,
    quality: 0.92,
    resources: { pike: 4, kralove: 4, eel: 5, perch: 3, snowdrop: 2 }
  },
  {
    id: 'brakmar-lava-pools',
    name: 'Bassins sombres de Brakmar',
    zone: 'Brakmar',
    kind: 'shore',
    x: -28,
    y: 32,
    quality: 0.75,
    resources: { 'breaded-fish': 4, sardine: 4, eel: 3, gold: 1 }
  }
];

export const DATASET_META = {
  id: 'dofusjob-seed-0.1',
  label: 'Seed DofusJob',
  generatedAt: '2026-07-08',
  accuracy: 'prototype',
  note:
    'Dataset de demarrage pour valider le moteur. Remplacer par un export complet de positions autorisees avant publication.'
};

