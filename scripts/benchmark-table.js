#!/usr/bin/env node

// Renders one or more benchmark-context JSON reports as a Markdown table.
// Usage:
//   node scripts/benchmark-table.js results/bench.json [more.json ...]
//   npm run benchmark:context -- --out=bench.json && node scripts/benchmark-table.js bench.json

import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (!paths.length) {
    console.error('Usage: node scripts/benchmark-table.js <report.json> [more.json ...]');
    process.exit(1);
}

const reports = paths.map((path) => ({ path, ...JSON.parse(readFileSync(path, 'utf8')) }));

const header = [
    'Report',
    'Memories',
    'Insert ms',
    'Inserts/s',
    'Search median ms',
    'Search p95 ms',
    'Vector model',
    'Node',
];
const rows = reports.map((report) => [
    report.path,
    String(report.memories),
    String(report.insertMs),
    String(report.insertsPerSecond),
    String(report.hybridSearch?.medianMs ?? 'n/a'),
    String(report.hybridSearch?.p95Ms ?? 'n/a'),
    report.vectorModel || 'n/a',
    report.node || 'n/a',
]);

const widths = header.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => row[index].length)),
);
const line = (columns) =>
    `| ${columns.map((column, index) => column.padEnd(widths[index])).join(' | ')} |`;

console.log(line(header));
console.log(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`);
for (const row of rows) console.log(line(row));
