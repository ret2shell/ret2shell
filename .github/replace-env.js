#!/usr/bin/env node
const file = process.argv[2];
if (!file) {
  console.error('Missing file argument');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

const filePath = path.resolve(process.cwd(), file);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/\$\{\s*([A-Z0-9_]+)\s*\}/g, (match, p1) => {
  const envVar = process.env[p1];
  if (envVar === undefined) {
    console.warn(`Environment variable ${p1} is not defined`);
    return match; // return the original match if env var is not defined
  }
  return envVar;
});

process.stdout.write(content);