# Radar npm

Classement quotidien des paquets npm les plus téléchargés, par thème technique.
Zéro dépendance, zéro clé API, zéro coût.

## Fonctionnement
- `scripts/build.mjs` interroge le registre npm public (`registry.npmjs.org/-/v1/search`), qui fournit déjà les téléchargements hebdo et mensuels.
- Sorties : `site/` (site statique multi-pages, sitemap, robots), `dist/radar-npm.html` (version une page), `data/latest.json` et `data/history.csv` (historique qui permet de calculer l'évolution).
- `.github/workflows/daily.yml` relance la collecte chaque jour à 05:17 UTC, commite les données et déploie `site/` sur GitHub Pages.

## Lancer en local
```bash
node scripts/build.mjs
```
Sur un proxy sortant, définir `NODE_USE_ENV_PROXY=1`.

## Activer GitHub Pages
Settings → Pages → Source : « GitHub Actions ».
