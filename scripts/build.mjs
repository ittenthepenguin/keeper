import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ttf':'font/ttf', '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8' };
const assets = {};
async function collect(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const bytes = await readFile(path), ext = '.' + entry.name.split('.').pop();
      assets['/' + relative('site', path).replaceAll('\\','/')] = [mime[ext] || 'application/octet-stream', bytes.toString('base64'), createHash('sha256').update(bytes).digest('hex')];
    }
  }
}
await collect('site');
const publish=JSON.parse(await readFile('publish.config.json','utf8'));
const menuConfig='window.KEEPER_CONFIG = '+JSON.stringify({landingUrl:publish.landingUrl,demoUrl:'/demo/',loginUrl:'',contactUrl:new URL('#pilot',publish.landingUrl).href,contactEmail:'ioh38@gatech.edu'})+';\n';
assets['/menu/config.js']=['text/javascript; charset=utf-8',Buffer.from(menuConfig).toString('base64'),createHash('sha256').update(menuConfig).digest('hex')];
await import('./pages.mjs');
await rm('dist', {recursive:true,force:true});
await mkdir('dist/server', {recursive:true});
await mkdir('dist/.openai', {recursive:true});
const worker = (await readFile('worker/index.js','utf8')).replace('export function createWorker(', 'function createWorker(');
await writeFile('dist/server/index.js', worker + '\nexport default createWorker(' + JSON.stringify(assets) + ');\n');
await writeFile('dist/.openai/hosting.json', await readFile('.openai/hosting.json'));
console.log(`Built a self-contained Worker with ${Object.keys(assets).length} public assets.`);
