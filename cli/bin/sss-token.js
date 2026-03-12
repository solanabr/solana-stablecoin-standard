#!/usr/bin/env node

// Используем ts-node для компиляции TypeScript "на лету"
require('ts-node').register({
  project: __dirname + '/../tsconfig.json'
});

require('../src/index.ts');