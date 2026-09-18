#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCompilerVault } from '../src/context/compiler-evaluator.js';

const directory = dirname(fileURLToPath(import.meta.url));
const datasetPath = process.argv[2] || join(directory, '..', 'evals', 'context-compiler.json');
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
const report = evaluateCompilerVault(dataset);

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
