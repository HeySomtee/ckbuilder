'use strict';
// Schedule --once once per minute on the separately configured durable operator host.
const { runWorkerOnce } = require('../dist/modules/direct/worker.js');
if (process.argv.slice(2).join(' ') !== '--once') {
  console.error('Usage: direct-worker.cjs --once');
  process.exitCode = 1;
} else
  runWorkerOnce().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Direct worker failed');
    process.exitCode = 1;
  });
