# DofusJob

Planificateur de boucles de recolte Dofus, pense pour maximiser l'XP par minute ou la quantite d'une ressource ciblee.

## Fonctionnement

- Choix du metier principal, du niveau et de metiers secondaires facultatifs.
- Deux objectifs : `XP maximale` ou `Ressource ciblee`.
- Calcul par XP cumulee des nodes, temps de recolte, deplacement map par map, zaaps et transporteurs.
- Itineraire complet avec une commande `/travel x y` copiable pour chaque map.
- Quantites exactes par ressource et identifiants des cellules de recolte.
- Carte raster du Monde des Douze avec zoom, drag, cases de route et apercu reel de la map active.
- Interface responsive, testee sur desktop et mobile.

## Donnees

Le fichier `src/generated/dofusData.js` est genere avec :

- la release Dofusdude `dofus3-main` 3.6.6.6 pour les maps, sous-zones, skills, traductions et zaaps ;
- l'API Dofusdude pour les noms et icones des ressources ;
- l'API DofusDB `recoltables2` pour les positions et quantites exactes des nodes par map et cellule.

Regeneration :

```bash
node scripts/generate_dofus_data.mjs
```

Donnees issues de DofusDB. Utilisation soumise a la LPNC-IA 1.0. Le projet doit rester non commercial et respecter les conditions de cette licence.

## Scripts

```bash
npm install
npm run dev
npm run build
npm test
```

## Deploiement

`netlify.toml` publie `dist/` apres `npm run build`.

## Licence

GPL-3.0-or-later. Dofus, ses cartes et ses illustrations appartiennent a Ankama.
