'use strict';
// Schedule --once once per minute on the separately configured durable operator host.
const { runWorkerOnce } = require('../dist/modules/direct/worker.js');
if (process.argv.slice(2).join(' ') !== '--once') {
  console.error('Usage: direct-worker.cjs --once');
  process.exitCode = 1;
} else {
  // A hosted shutdown stops future passes in the supervisor; let this pass release
  // its journal leases normally. The supervisor bounds draining if a call hangs.
  let stopping = false;
  const drain = () => {
    stopping = true;
  };
  process.once('SIGTERM', drain);
  process.once('SIGINT', drain);
  runWorkerOnce(() => stopping)
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Direct worker failed');
      process.exitCode = 1;
    })
    .finally(() => {
      process.off('SIGTERM', drain);
      process.off('SIGINT', drain);
    });
}
