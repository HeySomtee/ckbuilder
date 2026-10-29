const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const types={'.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.zip':'application/zip'};
http.createServer((req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep) || !['.html','.svg','.png','.ico','.zip'].includes(path.extname(file)) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(file).pipe(res);
}).listen(4197,'127.0.0.1',()=>console.log('Streak identity preview: http://127.0.0.1:4197/'));
