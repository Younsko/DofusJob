# DofusJob

Planificateur visuel d'itineraires de recolte pour monter les metiers Dofus sans rester immobile sur une map.

## Ce que fait deja le prototype

- Selection multi-metiers: mineur, bucheron, paysan, alchimiste, pecheur.
- Priorite automatique par niveau de ressource, ou priorites manuelles.
- Calcul glouton score / distance avec densite, niveau, valeur de spot et zaaps.
- Carte SVG interactive basee sur les vraies coordonnees Dofus 3: 11 710 cases de maps, sous-zones, zaaps et transporteurs frigostiens.
- Ressources et icones issues de l'API Dofusdude.
- Import/export JSON pour remplacer les donnees seed par un dump plus complet.
- Tests unitaires du moteur de route.

## Scripts

```bash
npm install
npm run dev
npm run build
npm test
```

## Donnees

Le dataset compact est genere dans `src/generated/dofusData.js` avec :

- la release `dofusdude/dofus3-main` 3.6.6.6 pour maps, sous-zones, skills, traductions et zaaps associes ;
- l'API Dofusdude pour les noms/icones des ressources ;
- une estimation de densite par sous-zone quand le jeu ne publie pas le nombre exact de nodes par map dans ces exports.

Regenerer :

```bash
node scripts/generate_dofus_data.mjs
```

DofusJob ne copie pas l'API DofusDB. La spec Dofusdude peut completer les metadonnees ressources, mais les positions de recolte au niveau map doivent venir d'une source distincte ou d'une saisie/import dediee.

Le fichier `worldmap_images.tar.gz` officiel communautaire pese environ 1.7 Go et n'est pas embarque dans Netlify. La carte actuelle reproduit les vraies coordonnees/cases en SVG leger. Pour avoir les tuiles raster exactes comme DofusDB, il faudra ajouter un CDN d'assets autorise et un generateur de tiles.

## Deploiement Netlify

`netlify.toml` publie `dist/` apres `npm run build`.

## Licence

GPL-3.0-or-later pour rester compatible avec les sources communautaires GPL si elles sont branchees ensuite. Dofus et ses assets appartiennent a Ankama.
