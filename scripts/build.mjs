import {mkdir,rm,copyFile,cp,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const files = [
  'app.js','config.js',
  'api/checkout.js','api/health.js','api/session.js','api/webhook.js','api/progress.js','api/reconcile.js',
  'lib/stripe.js','lib/amount.js','lib/events.js','lib/campaign-links.js','lib/db.js','lib/fx.js','lib/ledger.js',
];
for (const file of files) execFileSync(process.execPath,['--check',file]);
await rm('dist',{recursive:true,force:true}); await mkdir('dist/lib',{recursive:true});
for(const file of ['index.html','styles.css','app.js','config.js','CNAME']) await copyFile(file,`dist/${file}`);
await copyFile('lib/amount.js','dist/lib/amount.js'); await cp('assets','dist/assets',{recursive:true});
const html = await readFile('index.html','utf8');
if (!html.includes('id="donation-form"') || !html.includes('type="module" src="app.js"')) throw new Error('Donation form is missing');
console.log('Built static page and checked all server/client JavaScript.');
