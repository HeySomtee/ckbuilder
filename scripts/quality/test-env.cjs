/* Preloaded only by isolated quality checks, never by the application. */
const http = require('node:http');
const https = require('node:https');
const { urlToHttpOptions } = require('node:url');

process.env.STREAK_SKIP_ENV_FILE = '1';
process.env.NODE_ENV = 'test';
delete process.env.STREAK_PUBLIC_ORIGIN;
for (const name of Object.keys(process.env)) {
  if (
    /(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|DATABASE_URL|SUPABASE|TELEGRAM|API_SPORTS|NOTIFY_PROVIDER)/i.test(
      name,
    ) &&
    name !== 'PG_TEST_URL'
  )
    delete process.env[name];
}
delete process.env.NODE_OPTIONS;

function assertLocalHost(hostname) {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname).toLowerCase())) {
    throw new Error(
      'Quality tests cannot contact an external HTTP endpoint. Use a loopback fixture.',
    );
  }
}
function localUrl(input) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Quality tests only allow HTTP(S) loopback fixture URLs.');
  }
  assertLocalHost(url.hostname);
  return url;
}

function localRequestOptions(transport, input, options) {
  // Match Node's URL + options overload, then forward the validated materialized
  // options. A later hostname option must never escape URL validation.
  const result = {
    ...(typeof input === 'string' || input instanceof URL
      ? urlToHttpOptions(localUrl(input))
      : input),
    ...(options && typeof options === 'object' ? options : {}),
  };
  for (const name of ['hostname', 'host', 'servername']) {
    if (result[name] != null && result[name] !== '') assertLocalHost(result[name]);
  }
  assertLocalHost(result.hostname || result.host || 'localhost');
  // Custom transports, DNS resolvers and sockets can ignore the checked host.
  for (const name of ['socketPath', 'createConnection', 'lookup']) {
    if (result[name] != null)
      throw new Error(`Quality tests forbid custom HTTP ${name}. Use a loopback fixture.`);
  }
  for (const name of ['agent', '_defaultAgent']) {
    if (result[name] != null && result[name] !== false && result[name] !== transport.globalAgent) {
      throw new Error('Quality tests forbid custom HTTP agents. Use a loopback fixture.');
    }
  }
  return result;
}

for (const transport of [http, https]) {
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (input, options, callback) {
      const validated = localRequestOptions(transport, input, options);
      return original.call(this, validated, typeof options === 'function' ? options : callback);
    };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  localUrl(typeof input === 'object' && !(input instanceof URL) ? input.url : input);
  if (init?.dispatcher != null) {
    throw new Error('Quality tests forbid custom fetch dispatchers. Use a loopback fixture.');
  }
  // Native fetch follows redirects internally without calling this wrapper.
  // Expose 3xx responses instead of following an unchecked destination.
  return originalFetch(input, { ...init, redirect: 'manual' });
};
