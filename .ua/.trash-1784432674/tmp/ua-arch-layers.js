const r = require('../tmp/ua-arch-results.json');
const fs = require('fs');
const path = require('path');
const layers = { api: [], ui: [], lib: [], core: [], models: [], data: [], test: [], scripts: [], config: [], docs: [] };
for (const n of r.nodeList) {
  const p = n.filePath.replace(/\\/g, '/');
  const id = n.id;
  if (/\.(test|spec)\./.test(p) || p.startsWith('src/__tests__')) layers.test.push(id);
  else if (n.type === 'table' || p.startsWith('supabase')) layers.data.push(id);
  else if (n.type === 'document') layers.docs.push(id);
  else if (p.startsWith('src/app/api')) layers.api.push(id);
  else if (p.startsWith('src/app') || p.startsWith('src/components') || p.startsWith('src/types')) layers.ui.push(id);
  else if (p.startsWith('src/lib')) layers.lib.push(id);
  else if (p.startsWith('src/core')) layers.core.push(id);
  else if (p.startsWith('src/shared')) layers.models.push(id);
  else if (p.startsWith('scripts')) layers.scripts.push(id);
  else layers.config.push(id);
}
const meta = {
  api: ['layer:api', 'API Layer', 'Next.js API route handlers for ingestion, workbooks, mods, chat, day records, and the analyze/decide pipeline endpoints under src/app/api.'],
  ui: ['layer:ui', 'UI Layer', 'Next.js pages and layouts (dashboard, SPC, staging, reports, CAPA), editorial design-system primitives, domain components, and shared dashboard view types.'],
  lib: ['layer:ai-analysis', 'AI & Analysis Engine', 'AI provider chain (tryModels), Zod schemas, deterministic metrics computation, dashboard builder, and analytics utilities in src/lib.'],
  core: ['layer:ingestion-core', 'Ingestion & Ontology Core', 'Excel workbook ingestion, canonical ledger events, ontology/recognition, and the mod pipeline in src/core.'],
  models: ['layer:domain-models', 'Domain Models', 'Shared domain model definitions for workbooks, entities, ontology, and decisions in src/shared/models.'],
  data: ['layer:data', 'Data Layer', 'Supabase SQL migrations and the tables they define: sessions, canonical ledger, datasets, registries, and mod core.'],
  test: ['layer:test', 'Tests', 'Jest unit and pipeline tests covering schemas, metrics, ingestion, and API routes.'],
  scripts: ['layer:scripts', 'Scripts & Diagnostics', 'Standalone diagnostic, migration, and maintenance scripts in scripts/ that exercise the core and lib modules.'],
  config: ['layer:config', 'Configuration & Tooling', 'Project configuration (Next.js, TypeScript, ESLint, Jest, PostCSS, env example) plus the standalone demo page.'],
  docs: ['layer:documentation', 'Documentation', 'Project and agent guides (README, AGENTS, CLAUDE) plus the rais-pro design-system specification documents.'],
};
const out = Object.entries(layers).filter(([, v]) => v.length).map(([k, v]) => ({ id: meta[k][0], name: meta[k][1], description: meta[k][2], nodeIds: v }));
const total = out.reduce((s, l) => s + l.nodeIds.length, 0);
if (total !== r.fileStats.totalFileNodes) { console.error('COUNT MISMATCH', total, r.fileStats.totalFileNodes); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '../intermediate/layers.json'), JSON.stringify(out, null, 2));
out.forEach(l => console.log(l.id, l.nodeIds.length));
console.log('total', total);
