'use strict';
// Build Streak first. This CLI never loads .env, legacy wallet files or live keys implicitly.
const { runOperator } = require('../dist/modules/direct/cli.js');
runOperator(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Direct operator failed');
  process.exitCode = 1;
});
