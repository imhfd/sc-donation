import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
process.env.SITE_URL ||= 'http://127.0.0.1:4173';
process.env.ALLOWED_ORIGIN ||= process.env.SITE_URL;
const handlers = Object.fromEntries(await Promise.all(['checkout','health','session','webhook'].map(async name=>[name,(await import(`../api/${name}.js`)).default])));
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  const url = new URL(req.url,'http://localhost:4173');
  res.status = code => {res.statusCode=code; return res}; res.json = data => {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))};
  if(url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5); if(!handlers[name]) return res.status(404).end();
    req.query=Object.fromEntries(url.searchParams);
    if(name !== 'webhook') { const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)return res.status(413).end();chunks.push(chunk)}req.body=Buffer.concat(chunks).toString(); }
    try {await handlers[name](req,res)}catch {res.status(500).json({error:'Server error.'})}return;
  }
  // Only expose the built public site, never backend sources or environment files.
  const file=path.resolve('dist','.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(path.resolve('dist')+path.sep)) return res.status(403).end();
  try{const content=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(content)}catch{res.status(404).end('Not found')}
}).listen(4173,'127.0.0.1',()=>console.log('Donation preview: http://127.0.0.1:4173'));
