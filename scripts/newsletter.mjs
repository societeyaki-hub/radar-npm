// Radar npm — infolettre hebdomadaire.
// 1. Construit l'édition à partir de data/latest.json et data/history.csv.
// 2. Écrit dist/newsletter.html (aperçu) dans tous les cas.
// 3. Envoie la campagne via l'API Brevo UNIQUEMENT si BREVO_API_KEY, BREVO_LIST_ID,
//    BREVO_SENDER_EMAIL sont définis ET que SEND_NEWSLETTER=1 (sinon : aperçu seul).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = process.env.SITE_URL || (process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0]}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "https://societeyaki-hub.github.io/radar-npm/");
const CONTACT_URL = process.env.GITHUB_REPOSITORY
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}/issues`
  : "https://github.com/societeyaki-hub/radar-npm/issues";

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n ?? 0).toLocaleString("fr-FR");
const slugOf = (name) => name.replace(/^@/, "").replace(/\//g, "--").toLowerCase();

const latest = JSON.parse(await readFile(path.join(ROOT, "data", "latest.json"), "utf8"));
const csvLines = (await readFile(path.join(ROOT, "data", "history.csv"), "utf8")).trim().split("\n").slice(1);

// Historique par paquet : [{date, weekly}]
const byPkg = new Map();
for (const line of csvLines) {
  const [date, , name, weekly] = line.split(",");
  if (weekly === "" || weekly === undefined) continue;
  if (!byPkg.has(name)) byPkg.set(name, []);
  byPkg.get(name).push({ date, weekly: Number(weekly) });
}
const dates = [...new Set(csvLines.map((l) => l.split(",")[0]))].sort();
const today = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);

// Variation sur 7 jours : compare la dernière valeur à la plus proche valeur d'il y a ~7 jours.
function weeklyMove(name) {
  const rows = byPkg.get(name) || [];
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const cutoff = new Date(new Date(last.date).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const old = [...rows].reverse().find((r) => r.date <= cutoff) || rows[0];
  if (!old.weekly || old.date === last.date) return null;
  return { name, now: last.weekly, before: old.weekly, pct: ((last.weekly - old.weekly) / old.weekly) * 100, days: Math.round((new Date(last.date) - new Date(old.date)) / 86400000) };
}

const allPkgs = latest.categories.flatMap((c) => c.items.map((it) => ({ ...it, cat: c })));
const seen = new Set();
const uniquePkgs = allPkgs.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));

const moves = uniquePkgs.map((p) => ({ ...weeklyMove(p.name), pkg: p })).filter((m) => m.name && m.days >= 1);
const risers = moves.filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 5);
const fallers = moves.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 3);
const hasTrend = moves.length > 0;

const top = [...uniquePkgs].sort((a, b) => (b.weekly ?? 0) - (a.weekly ?? 0)).slice(0, 8);

const pkgLink = (name) => `${SITE_URL}paquets/${slugOf(name)}/`;
const moveLine = (m) => `<li><a href="${pkgLink(m.name)}">${esc(m.name)}</a> : ${m.pct >= 0 ? "+" : ""}${m.pct.toFixed(1).replace(".", ",")} % (${fmt(m.before)} → ${fmt(m.now)} téléch./sem.)</li>`;
const topLine = (p) => `<li><a href="${pkgLink(p.name)}">${esc(p.name)}</a> : ${fmt(p.weekly)} téléch./sem. <span style="color:#57534e">· ${esc(p.cat.name)}</span></li>`;

const subject = `Radar npm : le classement de la semaine du ${today}`;
const preheader = hasTrend
  ? `${risers[0] ? risers[0].name + " en hausse" : "Les paquets npm de la semaine"}, et le top 8 des téléchargements.`
  : "Le top 8 des paquets npm les plus téléchargés cette semaine.";

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;background:#fafaf9;color:#1c1917;font:16px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<h1 style="font-size:22px;margin:0 0 4px">Radar npm</h1>
<p style="color:#57534e;margin:0 0 20px">Le classement hebdomadaire des paquets npm, à partir du registre public.</p>
${hasTrend && risers.length ? `<h2 style="font-size:17px;margin:24px 0 8px">En forte hausse</h2><ul style="padding-left:20px;margin:0">${risers.map(moveLine).join("")}</ul>` : ""}
${hasTrend && fallers.length ? `<h2 style="font-size:17px;margin:24px 0 8px">En baisse</h2><ul style="padding-left:20px;margin:0">${fallers.map(moveLine).join("")}</ul>` : ""}
<h2 style="font-size:17px;margin:24px 0 8px">Le top 8 de la semaine</h2>
<ul style="padding-left:20px;margin:0">${top.map(topLine).join("")}</ul>
<p style="margin:28px 0 0"><a href="${SITE_URL}" style="color:#0f766e;font-weight:600">Voir le classement complet</a></p>
<hr style="border:0;border-top:1px solid #e7e5e4;margin:28px 0">
<p style="color:#57534e;font-size:13px">Tu reçois ce message parce que tu t'es inscrit à la newsletter Radar npm. Les chiffres sont les téléchargements hebdomadaires renvoyés par le registre npm. Pour toute question : <a href="${CONTACT_URL}" style="color:#0f766e">contact</a>.</p>
{{UNSUBSCRIBE}}
</div></body></html>`;

await mkdir(path.join(ROOT, "dist"), { recursive: true });
await writeFile(path.join(ROOT, "dist", "newsletter.html"), html.replace("{{UNSUBSCRIBE}}", ""));
console.log(`Aperçu écrit : dist/newsletter.html (${hasTrend ? moves.length + " paquets avec tendance" : "pas encore de tendance : une semaine de données manque"})`);

const { BREVO_API_KEY, BREVO_LIST_ID, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SEND_NEWSLETTER } = process.env;
if (SEND_NEWSLETTER !== "1" || !BREVO_API_KEY || !BREVO_LIST_ID || !BREVO_SENDER_EMAIL) {
  console.log("Envoi désactivé (SEND_NEWSLETTER=1 et les secrets BREVO_* sont requis). Aucun email envoyé.");
  process.exit(0);
}

const headers = { "api-key": BREVO_API_KEY, "content-type": "application/json", accept: "application/json" };
const create = await fetch("https://api.brevo.com/v3/emailCampaigns", {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: `Radar npm ${today}`,
    subject,
    previewText: preheader,
    sender: { name: BREVO_SENDER_NAME || "Radar npm", email: BREVO_SENDER_EMAIL },
    htmlContent: html.replace("{{UNSUBSCRIBE}}", ""),
    recipients: { listIds: [Number(BREVO_LIST_ID)] },
  }),
});
if (!create.ok) throw new Error(`Création de la campagne refusée : ${create.status} ${await create.text()}`);
const { id } = await create.json();

const send = await fetch(`https://api.brevo.com/v3/emailCampaigns/${id}/sendNow`, { method: "POST", headers });
if (!send.ok) throw new Error(`Envoi refusé : ${send.status} ${await send.text()}`);
console.log(`Campagne ${id} envoyée.`);
