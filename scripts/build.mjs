// Radar npm — collecte quotidienne + génération du site statique.
// Zéro dépendance, zéro clé API. Source : registre npm public (recherche + téléchargements).
// Usage : node scripts/build.mjs   (variable optionnelle SITE_URL pour les URLs absolues)

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_DIR = path.join(ROOT, "site");
const DATA_DIR = path.join(ROOT, "data");
const PER_CATEGORY = 15;
const SITE_URL = (process.env.SITE_URL || (process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0]}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "")).replace(/\/?$/, "/");

const CATEGORIES = [
  { slug: "generateurs-de-sites", name: "Générateurs de sites statiques", keyword: "static-site-generator", intro: "Outils qui transforment du Markdown ou des données en pages HTML prêtes à publier." },
  { slug: "tests", name: "Tests automatisés", keyword: "testing", intro: "Frameworks de tests unitaires, d'intégration et end-to-end pour JavaScript et TypeScript." },
  { slug: "cli", name: "Outils en ligne de commande", keyword: "cli", intro: "Bibliothèques pour construire des interfaces en ligne de commande fiables." },
  { slug: "markdown", name: "Markdown et parsing", keyword: "markdown", intro: "Parseurs et convertisseurs Markdown utilisés dans les blogs, docs et éditeurs." },
  { slug: "graphiques", name: "Graphiques et visualisation", keyword: "charts", intro: "Bibliothèques de graphiques pour tableaux de bord et sites de données." },
  { slug: "ia", name: "IA et clients LLM", keyword: "llm", intro: "SDK et utilitaires pour intégrer des modèles de langage dans une application." },
];

// Contact : page d'issues publique du dépôt (aucune adresse personnelle publiée).
const CONTACT_URL = process.env.GITHUB_REPOSITORY
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}/issues`
  : "https://github.com/societeyaki-hub/radar-npm/issues";

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const todayISO = () => new Date().toISOString().slice(0, 10);

async function fetchJSON(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "radar-npm/1.0 (static index builder)", Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status} pour ${url}`);
    return await r.json();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 1500 * attempt));
      return fetchJSON(url, attempt + 1);
    }
    throw e;
  }
}

async function collectCategory(cat) {
  const url = `https://registry.npmjs.org/-/v1/search?text=keywords:${encodeURIComponent(cat.keyword)}&size=${PER_CATEGORY * 2}&quality=0.3&popularity=1.0&maintenance=0.2`;
  const res = await fetchJSON(url);
  const pkgs = (res.objects || [])
    .filter((o) => !o.package.deprecated)
    .slice(0, PER_CATEGORY);
  // La recherche du registre renvoie déjà downloads.weekly / monthly : un seul appel par catégorie.
  const items = pkgs.map((o) => {
    const p = o.package;
    return {
      name: p.name,
      version: p.version,
      description: p.description || "",
      url: `https://www.npmjs.com/package/${p.name}`,
      updated: p.date || o.updated || null,
      monthly: o.downloads?.monthly ?? null,
      weekly: o.downloads?.weekly ?? null,
    };
  });
  items.sort((a, b) => (b.weekly ?? -1) - (a.weekly ?? -1));
  return items;
}

async function loadHistory() {
  const file = path.join(DATA_DIR, "history.csv");
  if (!existsSync(file)) return new Map();
  const lines = (await readFile(file, "utf8")).trim().split("\n").slice(1);
  const byPkg = new Map();
  for (const line of lines) {
    const [date, category, name, weekly] = line.split(",");
    if (!byPkg.has(category)) byPkg.set(category, new Map());
    const m = byPkg.get(category);
    if (!m.has(name)) m.set(name, []);
    m.get(name).push({ date, weekly: Number(weekly) });
  }
  return byPkg;
}

// Variation vs la dernière collecte précédente (si elle existe).
function trendFor(history, catSlug, name, current) {
  const past = history.get(catSlug)?.get(name);
  if (!past || past.length === 0 || current == null) return null;
  const prev = past[past.length - 1].weekly;
  if (!prev) return null;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

function pageHTML({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#57534e;--card:#fff;--line:#e7e5e4;--accent:#0f766e;--up:#15803d;--down:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#fafaf9;--muted:#a8a29e;--card:#292524;--line:#44403c;--accent:#5eead4;--up:#4ade80;--down:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:960px;margin:0 auto;padding:0 16px}
header{padding:28px 0 12px;border-bottom:1px solid var(--line)}
header a{color:var(--accent);text-decoration:none;font-weight:700}
h1{font-size:1.7rem;margin:.6rem 0 .3rem}h2{font-size:1.2rem;margin:2rem 0 .6rem}
p.lead{color:var(--muted);margin:.2rem 0 1rem}
nav.cats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
nav.cats a{border:1px solid var(--line);padding:5px 10px;border-radius:999px;color:var(--fg);text-decoration:none;font-size:.9rem;background:var(--card)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:block;overflow-x:auto}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td.num{white-space:nowrap;font-variant-numeric:tabular-nums}
.up{color:var(--up)}.down{color:var(--down)}.muted{color:var(--muted);font-size:.9rem}
a.pkg{color:var(--accent);font-weight:600;text-decoration:none}
footer{margin:36px 0;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line);padding-top:14px}
.sponsor{margin:24px 0;padding:14px 16px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:.92rem}
</style>
</head>
<body>
<div class="wrap">
<header><a href="${SITE_URL}">Radar npm</a> <span class="muted">· classement quotidien des paquets npm</span></header>
${body}
<div class="sponsor">Cet annuaire est gratuit et mis à jour automatiquement chaque jour à partir du registre npm public. Les chiffres sont les téléchargements hebdomadaires tels que renvoyés par le registre npm.</div>
<footer><nav class="legal"><a href="${SITE_URL}a-propos/">À propos</a> · <a href="${SITE_URL}methodologie/">Méthodologie</a> · <a href="${SITE_URL}mentions-legales/">Mentions légales</a> · <a href="${SITE_URL}confidentialite/">Confidentialité</a> · <a href="${CONTACT_URL}">Contact</a></nav>Données : registre npm public (registry.npmjs.org). Dernière mise à jour : ${esc(todayISO())}. Ce site ne remplace pas la documentation officielle de chaque paquet.</footer>
</div>
</body>
</html>`;
}

// Slug d'URL stable pour un paquet (gère les noms à scope : @scope/nom).
const slugOf = (name) => name.replace(/^@/, "").replace(/\//g, "--").toLowerCase();

function tableHTML(items, history, cat) {
  const rows = items.map((it, i) => {
    const t = trendFor(history, cat.slug, it.name, it.weekly);
    const trend = t == null ? `<span class="muted">—</span>` : `<span class="${t >= 0 ? "up" : "down"}">${t >= 0 ? "+" : ""}${t}&nbsp;%</span>`;
    return `<tr>
<td class="num">${i + 1}</td>
<td><a class="pkg" href="${SITE_URL}paquets/${slugOf(it.name)}/">${esc(it.name)}</a> <a class="muted" href="${esc(it.url)}" rel="noopener">npm ↗</a><div class="muted">${esc(it.description)}</div></td>
<td class="num">${it.weekly == null ? "—" : fmt(it.weekly)}</td>
<td class="num">${trend}</td>
<td class="num muted">${esc(it.version)}</td>
</tr>`;
  }).join("\n");
  return `<table><thead><tr><th>#</th><th>Paquet</th><th>Téléch. / semaine</th><th>Évolution</th><th>Version</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const nav = (activeSlug) => `<nav class="cats">${CATEGORIES.map((c) => `<a href="${SITE_URL}${c.slug}/"${c.slug === activeSlug ? ' aria-current="page"' : ""}>${esc(c.name)}</a>`).join("")}</nav>`;

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(SITE_DIR, { recursive: true });
  for (const d of CATEGORIES) await mkdir(path.join(SITE_DIR, d.slug), { recursive: true });

  const history = await loadHistory();
  const today = todayISO();
  const result = { generated_at: new Date().toISOString(), categories: [] };
  const csvRows = [];

  for (const cat of CATEGORIES) {
    const items = await collectCategory(cat);
    result.categories.push({ ...cat, items });
    for (const it of items) csvRows.push(`${today},${cat.slug},${it.name},${it.weekly ?? ""}`);
    console.log(`[${cat.slug}] ${items.length} paquets collectés`);
  }

  // Historique (append) : une ligne par paquet et par jour, sans doublon du même jour.
  const csvFile = path.join(DATA_DIR, "history.csv");
  if (!existsSync(csvFile)) await writeFile(csvFile, "date,category,package,weekly_downloads\n");
  const existingToday = new Set();
  if (existsSync(csvFile)) {
    for (const l of (await readFile(csvFile, "utf8")).split("\n")) if (l.startsWith(today + ",")) existingToday.add(l);
  }
  const fresh = csvRows.filter((r) => !existingToday.has(r));
  if (fresh.length) await appendFile(csvFile, fresh.join("\n") + "\n");

  await writeFile(path.join(DATA_DIR, "latest.json"), JSON.stringify(result, null, 2));

  // Pages statiques : à propos, méthodologie, mentions légales, confidentialité.
  const staticPages = [
    { slug: "a-propos", title: "À propos de Radar npm", description: "Qui fait Radar npm, pourquoi il existe et comment il est financé.", body: `<h1>À propos de Radar npm</h1>
<p>Radar npm est un annuaire gratuit qui classe chaque jour les paquets npm les plus téléchargés, par thème : générateurs de sites statiques, tests, outils en ligne de commande, Markdown, graphiques et clients IA.</p>
<p>Le site est entièrement automatisé. Un script interroge le registre npm public une fois par jour, met à jour les classements et conserve un historique des téléchargements hebdomadaires. Aucune donnée personnelle des visiteurs n'est collectée par le site lui-même.</p>
<p>Le projet est open source et hébergé gratuitement. Pour toute question ou correction, passe par la <a href="${CONTACT_URL}">page de contact</a>.</p>` },
    { slug: "methodologie", title: "Méthodologie du classement", description: "Comment les paquets sont sélectionnés, classés et mis à jour.", body: `<h1>Méthodologie du classement</h1>
<p><strong>Sélection.</strong> Pour chaque thème, le site interroge la recherche du registre npm avec un mot-clé (par exemple « testing » ou « cli »). Les paquets marqués comme dépréciés sont exclus. On garde les 15 premiers résultats renvoyés par le registre, qui tient compte de la popularité, de la qualité et de la maintenance.</p>
<p><strong>Classement.</strong> Les paquets sont triés par nombre de téléchargements hebdomadaires tels que renvoyés par le registre npm. Ce n'est pas un classement de qualité : un paquet très téléchargé peut être ancien, ou tiré par d'autres dépendances.</p>
<p><strong>Évolution.</strong> La variation affichée compare le total du jour à la dernière collecte enregistrée dans l'historique. Elle n'apparaît qu'à partir du deuxième jour de collecte.</p>
<p><strong>Mise à jour.</strong> Les données sont recalculées chaque jour à 05:17 UTC par une tâche automatisée.</p>
<p><strong>Limites.</strong> Les chiffres sont des indicateurs d'usage, pas des revenus ni des garanties. Consulte toujours la documentation officielle d'un paquet avant de l'adopter.</p>` },
    { slug: "mentions-legales", title: "Mentions légales", description: "Éditeur, hébergement et propriété intellectuelle du site Radar npm.", body: `<h1>Mentions légales</h1>
<p><strong>Éditeur.</strong> Radar npm est un projet personnel publié sous licence open source. Pour toute demande, utilise la <a href="${CONTACT_URL}">page de contact</a>.</p>
<p><strong>Hébergement.</strong> Le site est hébergé par GitHub Pages (GitHub, Inc.).</p>
<p><strong>Données.</strong> Les classements proviennent du registre npm public. Les noms, descriptions et liens renvoient vers les paquets d'origine. Les marques et noms de paquets restent la propriété de leurs auteurs.</p>
<p><strong>Responsabilité.</strong> Les informations sont fournies telles quelles, sans garantie d'exactitude ou d'exhaustivité.</p>` },
    { slug: "confidentialite", title: "Politique de confidentialité", description: "Quelles données sont collectées, par qui et pourquoi sur Radar npm.", body: `<h1>Politique de confidentialité</h1>
<p>Radar npm ne demande aucun compte, ne collecte aucun formulaire et n'enregistre aucune donnée personnelle des visiteurs sur ses propres serveurs.</p>
<p>Le site est hébergé par GitHub Pages, qui peut collecter les données techniques habituelles des serveurs web (adresse IP, navigateur) selon sa propre politique de confidentialité.</p>
<p>Si des publicités ou des outils de mesure d'audience sont ajoutés à l'avenir, cette page sera mise à jour avant leur activation.</p>
<p>Pour toute question, utilise la <a href="${CONTACT_URL}">page de contact</a>.</p>` },
  ];
  for (const p of staticPages) {
    await mkdir(path.join(SITE_DIR, p.slug), { recursive: true });
    await writeFile(path.join(SITE_DIR, p.slug, "index.html"), pageHTML({
      title: `${p.title} | Radar npm`,
      description: p.description,
      canonical: `${SITE_URL}${p.slug}/`,
      body: p.body,
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: p.title, url: `${SITE_URL}${p.slug}/` },
    }));
  }

  // Une fiche par paquet : téléchargements, historique et commande d'installation.
  const rowsByPkg = new Map();
  for (const line of (await readFile(path.join(DATA_DIR, "history.csv"), "utf8")).trim().split("\n").slice(1)) {
    const [date, , name, weekly] = line.split(",");
    if (!rowsByPkg.has(name)) rowsByPkg.set(name, []);
    if (weekly !== "") rowsByPkg.get(name).push({ date, weekly: Number(weekly) });
  }
  const pkgUrls = [];
  const seenPkgs = new Set();
  for (const cat of result.categories) {
    for (const it of cat.items) {
      if (seenPkgs.has(it.name)) continue;
      seenPkgs.add(it.name);
      const slug = slugOf(it.name);
      const hist = (rowsByPkg.get(it.name) || []).slice(-30);
      const histRows = hist.length
        ? `<table><thead><tr><th>Date</th><th>Téléch. / semaine</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.date)}</td><td class="num">${fmt(h.weekly)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">Historique en cours de constitution : il apparaîtra après la deuxième collecte.</p>`;
      const body = `<h1>${esc(it.name)}</h1>
<p class="lead">${esc(it.description)}</p>
<p><a class="pkg" href="${esc(it.url)}" rel="noopener">Voir la page npm du paquet ↗</a> · <a href="${SITE_URL}${cat.slug}/">Retour à « ${esc(cat.name)} »</a></p>
<h2>Chiffres</h2>
<table><tbody>
<tr><th>Téléchargements / semaine</th><td class="num">${it.weekly == null ? "—" : fmt(it.weekly)}</td></tr>
<tr><th>Téléchargements / mois</th><td class="num">${it.monthly == null ? "—" : fmt(it.monthly)}</td></tr>
<tr><th>Version actuelle</th><td class="num">${esc(it.version)}</td></tr>
<tr><th>Dernière publication</th><td class="num">${it.updated ? esc(String(it.updated).slice(0, 10)) : "—"}</td></tr>
</tbody></table>
<h2>Installation</h2>
<pre><code>npm install ${esc(it.name)}</code></pre>
<h2>Historique des téléchargements</h2>
${histRows}`;
      await mkdir(path.join(SITE_DIR, "paquets", slug), { recursive: true });
      await writeFile(path.join(SITE_DIR, "paquets", slug, "index.html"), pageHTML({
        title: `${it.name} : téléchargements npm | Radar npm`,
        description: `${it.name} : ${it.weekly == null ? "" : fmt(it.weekly) + " téléchargements par semaine, "}version ${it.version}. ${it.description}`.slice(0, 300),
        canonical: `${SITE_URL}paquets/${slug}/`,
        body,
        jsonLd: { "@context": "https://schema.org", "@type": "SoftwareApplication", name: it.name, description: it.description, applicationCategory: "DeveloperApplication", url: it.url },
      }));
      pkgUrls.push(`${SITE_URL}paquets/${slug}/`);
    }
  }

  const sitemapUrls = [SITE_URL, ...staticPages.map((p) => `${SITE_URL}${p.slug}/`), ...pkgUrls];
  for (const cat of result.categories) {
    const body = `<h1>${esc(cat.name)}</h1>
<p class="lead">${esc(cat.intro)} Classement des ${cat.items.length} paquets npm les plus utilisés sur ce thème, par téléchargements hebdomadaires.</p>
${nav(cat.slug)}
<h2>Classement</h2>
${tableHTML(cat.items, history, cat)}`;
    const url = `${SITE_URL}${cat.slug}/`;
    sitemapUrls.push(url);
    await writeFile(path.join(SITE_DIR, cat.slug, "index.html"), pageHTML({
      title: `${cat.name} : classement npm du ${today} | Radar npm`,
      description: `Les ${cat.items.length} paquets npm les plus téléchargés sur ${cat.name.toLowerCase()}, mis à jour chaque jour.`,
      canonical: url,
      body,
      jsonLd: { "@context": "https://schema.org", "@type": "ItemList", name: cat.name, numberOfItems: cat.items.length, itemListElement: cat.items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: it.url })) },
    }));
  }

  const home = `<h1>Radar npm : les paquets qui comptent, chaque jour</h1>
<p class="lead">Classement automatique des paquets npm les plus téléchargés par thème technique. Données mises à jour quotidiennement depuis le registre npm.</p>
${nav(null)}
${result.categories.map((cat) => `<h2><a href="${SITE_URL}${cat.slug}/" style="color:inherit">${esc(cat.name)}</a></h2>
<p class="muted">${esc(cat.intro)}</p>
<p class="muted">Top 3 : ${cat.items.slice(0, 3).map((it) => `<a href="${esc(it.url)}">${esc(it.name)}</a> (${it.weekly == null ? "—" : fmt(it.weekly)}/sem)`).join(", ")}</p>`).join("\n")}`;
  await writeFile(path.join(SITE_DIR, "index.html"), pageHTML({
    title: "Radar npm : classement quotidien des paquets npm | Radar npm",
    description: "Classement quotidien des paquets npm les plus téléchargés par thème : générateurs de sites, tests, CLI, Markdown, graphiques, IA.",
    canonical: SITE_URL,
    body: home,
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Radar npm", url: SITE_URL },
  }));

  const today2 = today;
  await writeFile(path.join(SITE_DIR, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today2}</lastmod></url>`).join("\n")}
</urlset>
`);
  await writeFile(path.join(SITE_DIR, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
  // Version une page (toutes les catégories, ancres internes) pour publication à fichier unique.
  const singleNav = `<nav class="cats">${CATEGORIES.map((c) => `<a href="#${c.slug}">${esc(c.name)}</a>`).join("")}</nav>`;
  const singleBody = `<h1>Radar npm : les paquets qui comptent, chaque jour</h1>
<p class="lead">Classement quotidien des paquets npm les plus téléchargés par thème technique. Source : registre npm public. Mise à jour : ${esc(today)}.</p>
${singleNav}
${result.categories.map((cat) => `<section id="${cat.slug}"><h2>${esc(cat.name)}</h2><p class="lead">${esc(cat.intro)}</p>${tableHTML(cat.items, history, cat)}</section>`).join("\n")}`;
  await mkdir(path.join(ROOT, "dist"), { recursive: true });
  await writeFile(path.join(ROOT, "dist", "radar-npm.html"), pageHTML({
    title: "Radar npm : classement quotidien des paquets npm",
    description: "Classement quotidien des paquets npm les plus téléchargés par thème : générateurs de sites, tests, CLI, Markdown, graphiques, IA.",
    canonical: SITE_URL || "about:blank",
    body: singleBody,
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: "Radar npm" },
  }));

  console.log(`Site généré : ${sitemapUrls.length} pages, ${fresh.length} lignes d'historique ajoutées.`);
}

main().catch((e) => {
  console.error("Échec de la génération :", e);
  process.exit(1);
});
