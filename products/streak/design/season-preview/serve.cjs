const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const port = Number(process.env.STREAK_PREVIEW_PORT || 4175);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
};
const allowed = new Set([
  "index.html",
  "styles.css",
  "app.mjs",
  "data.mjs",
  "icons.mjs",
  "motion.mjs",
  "genie-geometry.mjs",
  "genie-mesh.mjs",
  "mark.svg",
  "ARCHITECTURE-PROPOSAL.md",
  "DESIGN-PROPOSAL.md",
  "README.md",
]);
const server = http.createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  let file;
  try {
    file =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
        /^\//,
        "",
      ) || "index.html";
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (!allowed.has(file)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const data = await fs.readFile(path.join(__dirname, file));
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Streak design preview: http://127.0.0.1:${port}/#/review`),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
