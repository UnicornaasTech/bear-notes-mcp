import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, 'outputs', 'results.json');
const OUTPUT_PATH = join(__dirname, 'outputs', 'report.html');

const raw = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
const { results: evalResults, config } = raw;

const description = config?.description ?? 'A/B Eval Report';
const timestamp = evalResults?.timestamp
  ? new Date(evalResults.timestamp).toISOString().slice(0, 16).replace('T', ' ')
  : 'unknown';

const providers = new Map();

for (const r of evalResults.results) {
  const label = r.provider?.label ?? r.provider?.id ?? 'unknown';
  if (!providers.has(label)) providers.set(label, []);

  providers.get(label).push({
    toolCalls: r.namedScores?.toolCalls ?? r.namedScores?.mcpCalls ?? r.namedScores?.openNoteCalls ?? 0,
    turns: r.namedScores?.turns ?? 0,
    cost: r.cost ?? 0,
    pass: r.success ?? false,
  });
}

function stats(runs, key) {
  const values = runs.map(r => r[key]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, min: Math.min(...values), max: Math.max(...values), values };
}

const providerNames = [...providers.keys()];
const providerStats = new Map();
for (const [name, runs] of providers) {
  const passCount = runs.filter(r => r.pass).length;
  providerStats.set(name, {
    runs,
    passCount,
    passRate: `${passCount}/${runs.length}`,
    toolCalls: stats(runs, 'toolCalls'),
    turns: stats(runs, 'turns'),
    cost: stats(runs, 'cost'),
  });
}

const COLORS = ['#d97753', '#3a8f7f'];

const metrics = [
  { key: 'toolCalls', label: 'bear-notes-mcp tool calls', tag: 'efficiency', unit: '', decimals: 0, description: 'Total calls to the bear-notes-mcp server (excludes SDK-internal tools like ToolSearch)' },
  { key: 'turns', label: 'Agent turns', tag: 'overhead', unit: '', decimals: 0, description: 'Conversation turns between the agent and MCP server' },
  { key: 'cost', label: 'Cost per run', tag: 'business', unit: '$', decimals: 2, description: 'USD cost of the agent run (API usage)' },
];

function renderMetricGroup(metric) {
  const allMeans = providerNames.map(p => providerStats.get(p)[metric.key].mean);
  const allValues = providerNames.flatMap(p => providerStats.get(p)[metric.key].values);
  const scaleMax = metric.fixedMax ?? Math.max(...allValues, 1);

  let rows = '';
  for (let i = 0; i < providerNames.length; i++) {
    const name = providerNames[i];
    const s = providerStats.get(name)[metric.key];
    const barPct = scaleMax > 0 ? (s.mean / scaleMax) * 100 : 0;
    const color = COLORS[i % COLORS.length];
    const formattedMean = metric.unit + s.mean.toFixed(metric.decimals);

    let dots = '';
    for (const v of s.values) {
      const dotPct = scaleMax > 0 ? (v / scaleMax) * 100 : 0;
      dots += `<span class="dot" style="left:${dotPct}%;background:${color};" title="${metric.unit}${v.toFixed(metric.decimals)}"></span>`;
    }

    rows += `
      <div class="bar-row">
        <span class="provider-label" style="color:${color}">${name}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${barPct}%;background:${color};"></div>
          ${dots}
        </div>
        <span class="bar-value">${formattedMean}</span>
      </div>`;
  }

  return `
    <div class="metric-group">
      <div class="metric-header">
        <h3>${metric.label}</h3>
        <span class="metric-tag tag-${metric.tag}">${metric.tag}</span>
      </div>
      <p class="metric-desc">${metric.description}</p>
      ${rows}
    </div>`;
}

function renderTable() {
  const names = [...providers.keys()];
  const runSets = names.map(n => providers.get(n));
  const numRuns = Math.max(...runSets.map(s => s.length));
  const BG = ['rgba(217,119,83,0.06)', 'rgba(58,143,127,0.06)'];

  const cols = [
    { key: 'toolCalls', label: 'Tool calls', fmt: v => Number.isInteger(v) ? String(v) : v.toFixed(1) },
    { key: 'turns', label: 'Turns', fmt: v => Number.isInteger(v) ? String(v) : v.toFixed(1) },
    { key: 'cost', label: 'Cost', fmt: v => `$${v.toFixed(2)}` },
    { key: 'pass', label: 'Result', fmt: v => v
      ? '<span class="badge badge-pass">PASS</span>'
      : '<span class="badge badge-fail">FAIL</span>' },
  ];

  function cell(p, content, isFirst) {
    const border = isFirst ? ' style="border-left:2px solid #e0e0e0;"' : '';
    return `<td class="p${p}"${border}>${content}</td>`;
  }

  const metricHeaders = cols.map(c =>
    `<th colspan="${names.length}" class="metric-col">${c.label}</th>`
  ).join('');

  const subHeaders = cols.map(() =>
    names.map((n, i) => `<th class="sub-header p${i}">${n}</th>`).join('')
  ).join('');

  let rows = '';
  for (let i = 0; i < numRuns; i++) {
    rows += `<tr><td class="run-num">${i + 1}</td>`;
    for (const col of cols) {
      for (let p = 0; p < names.length; p++) {
        const r = runSets[p]?.[i];
        rows += cell(p, r ? col.fmt(r[col.key]) : '', p === 0);
      }
    }
    rows += '</tr>';
  }

  let meanRow = `<tr class="mean-row"><td class="run-num">avg</td>`;
  for (const col of cols) {
    for (let p = 0; p < names.length; p++) {
      const s = providerStats.get(names[p]);
      const content = col.key === 'pass' ? '' : col.fmt(s[col.key].mean);
      meanRow += cell(p, content, p === 0);
    }
  }
  meanRow += '</tr>';

  let deltaRow = `<tr class="delta-row"><td class="run-num">delta</td>`;
  for (const col of cols) {
    if (col.key === 'pass') {
      deltaRow += `<td colspan="${names.length}" class="delta-cell" style="border-left:2px solid #e0e0e0;"></td>`;
    } else {
      const vals = names.map(n => providerStats.get(n)[col.key].mean);
      const hi = Math.max(...vals);
      const lo = Math.min(...vals);
      const ratio = lo > 0 ? (hi / lo).toFixed(1) : '∞';
      deltaRow += `<td colspan="${names.length}" class="delta-cell" style="border-left:2px solid #e0e0e0;">${ratio}×</td>`;
    }
  }
  deltaRow += '</tr>';

  const providerColorVars = names.map((_, i) =>
    `.p${i} { background: ${BG[i % BG.length]}; }`
  ).join('\n    ');

  return `
    <style>${providerColorVars}</style>
    <table>
      <thead>
        <tr class="metric-header-row"><th></th>${metricHeaders}</tr>
        <tr class="sub-header-row"><th class="corner">Run</th>${subHeaders}</tr>
      </thead>
      <tbody>${rows}${meanRow}${deltaRow}</tbody>
    </table>`;
}

function renderVerdicts() {
  let badges = '';
  for (let i = 0; i < providerNames.length; i++) {
    const name = providerNames[i];
    const s = providerStats.get(name);
    const allPass = s.passCount === s.runs.length;
    const cls = allPass ? 'verdict-pass' : 'verdict-fail';
    badges += `<span class="verdict ${cls}">${name}: ${s.passRate} ${allPass ? 'PASS' : 'FAIL'}</span> `;
  }
  return badges;
}

const repeatCount = providers.values().next().value.length;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${description}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    max-width: 960px; margin: 0 auto; padding: 32px 20px;
    color: #1a1a1a; background: #fafafa;
    line-height: 1.5;
  }
  header { margin-bottom: 32px; }
  h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 4px; }
  .meta { font-size: 0.85rem; color: #666; margin-bottom: 12px; }
  .verdicts { display: flex; gap: 12px; flex-wrap: wrap; }
  .verdict {
    font-size: 0.85rem; font-weight: 600; padding: 4px 12px;
    border-radius: 4px;
  }
  .verdict-pass { background: #d4edda; color: #155724; }
  .verdict-fail { background: #f8d7da; color: #721c24; }

  .metric-group {
    background: #fff; border: 1px solid #e5e5e5; border-radius: 8px;
    padding: 16px 20px; margin-bottom: 16px;
  }
  .metric-header { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .metric-header h3 { font-size: 1rem; font-weight: 600; }
  .metric-tag {
    font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    padding: 2px 8px; border-radius: 3px; letter-spacing: 0.5px;
  }
  .tag-control { background: #e8e8e8; color: #555; }
  .tag-thesis { background: #d0e8ff; color: #1a4d80; }
  .tag-efficiency { background: #fff3cd; color: #856404; }
  .tag-overhead { background: #e2d9f3; color: #4a2d7a; }
  .tag-business { background: #d4edda; color: #155724; }
  .metric-desc { font-size: 0.78rem; color: #888; margin-bottom: 12px; }

  .bar-row {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 8px; height: 28px;
  }
  .provider-label {
    width: 140px; text-align: right; font-size: 0.82rem;
    font-weight: 600; flex-shrink: 0; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .bar-track {
    flex: 1; height: 22px; background: #f0f0f0; border-radius: 4px;
    position: relative; overflow: visible;
  }
  .bar-fill {
    height: 100%; border-radius: 4px; opacity: 0.25;
    transition: width 0.3s ease;
  }
  .dot {
    position: absolute; top: 50%; width: 8px; height: 8px;
    border-radius: 50%; transform: translate(-50%, -50%);
    opacity: 0.7; cursor: default;
  }
  .bar-value {
    width: 60px; font-size: 0.85rem; font-weight: 600;
    font-variant-numeric: tabular-nums; flex-shrink: 0;
  }

  h2 { font-size: 1.1rem; font-weight: 600; margin: 32px 0 12px; }
  table {
    width: 100%; border-collapse: collapse; font-size: 0.82rem;
    background: #fff; border: 1px solid #ddd; border-radius: 8px;
    overflow: hidden; font-variant-numeric: tabular-nums;
  }
  .metric-header-row th {
    background: #f5f5f5; text-align: center; padding: 7px 10px;
    font-weight: 700; font-size: 0.78rem; text-transform: uppercase;
    letter-spacing: 0.4px; color: #555;
    border-bottom: 1px solid #e0e0e0;
  }
  .metric-col { border-left: 2px solid #e0e0e0; }
  .metric-col:first-of-type { border-left: none; }
  .sub-header-row th {
    padding: 5px 10px; font-size: 0.75rem; font-weight: 600;
    border-bottom: 2px solid #ddd; text-align: center;
  }
  .sub-header-row .corner { background: #f5f5f5; }
  td {
    padding: 7px 12px; text-align: right;
    border-bottom: 1px solid #f0f0f0;
  }
  .run-num {
    text-align: center; font-weight: 600; color: #999;
    background: #fafafa !important; width: 48px;
  }
  tr:hover td { background-color: rgba(0,0,0,0.02); }
  tr:last-child td { border-bottom: none; }
  .mean-row td {
    font-weight: 700; border-top: 2px solid #ddd;
    border-bottom: 1px solid #ddd;
  }
  .delta-row td, .delta-row .delta-cell {
    text-align: center; font-weight: 700; color: #856404;
    font-size: 0.78rem; background: #fffdf5 !important;
    letter-spacing: 0.3px;
  }
  .badge {
    font-size: 0.7rem; font-weight: 700; padding: 2px 8px;
    border-radius: 3px; letter-spacing: 0.3px;
  }
  .badge-pass { background: #d4edda; color: #155724; }
  .badge-fail { background: #f8d7da; color: #721c24; }

  footer { margin-top: 32px; font-size: 0.75rem; color: #aaa; text-align: center; }
</style>
</head>
<body>
  <header>
    <h1>${description}</h1>
    <div class="meta">${timestamp} &middot; ${repeatCount} repeats per provider</div>
    <div class="verdicts">${renderVerdicts()}</div>
  </header>

  ${renderTable()}

  <h2>Metric breakdown</h2>
  <section>
    ${metrics.map(renderMetricGroup).join('\n')}
  </section>

  <footer>Generated by evals/generate-report.js from promptfoo results.json</footer>
</body>
</html>`;

writeFileSync(OUTPUT_PATH, html);
console.log(`Report written to ${OUTPUT_PATH}`);
