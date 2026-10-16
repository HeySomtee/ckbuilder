'use strict';
// Separate operator process. Never loads .env or any signing-key file.
if (process.argv.slice(2).join(' ') !== '--serve') {
  console.error('Usage: direct-sponsor.cjs --serve');
  process.exitCode = 1;
} else
  require('../dist/modules/direct/sponsor-http.js')
    .runSponsorService()
    .catch(() => {
      console.error(
        'Sponsor service could not start. Review explicit configuration and durable operator state.',
      );
      process.exitCode = 1;
    });
