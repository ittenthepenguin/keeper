// The marketing page is static; the full prototype stays on the connected Worker host.
import {readFile,writeFile,mkdir,rm,cp} from 'node:fs/promises';
const config=JSON.parse(await readFile('publish.config.json','utf8'));
await rm('docs',{recursive:true,force:true});await mkdir('docs',{recursive:true});
let html=await readFile('site/index.html','utf8');
html=html.replaceAll('href="/menu/"',`href="${config.siteOrigin}/menu/"`).replaceAll('href="/demo/"',`href="${config.siteOrigin}/demo/"`);
html=html.replaceAll('"/landing.css"','"./landing.css"').replaceAll('"/icon.png"','"./icon.png"').replaceAll('/images/','./images/');
html=html.replace('</head>',`<link rel="canonical" href="${config.landingUrl}"></head>`);
let css=await readFile('site/landing.css','utf8');css=css.replaceAll('/fonts/','./fonts/').replaceAll('/images/','./images/');
await writeFile('docs/index.html',html);await writeFile('docs/landing.css',css);await writeFile('docs/.nojekyll','');
for(const path of ['fonts','images','icon.png'])await cp('site/'+path,'docs/'+path,{recursive:true});
console.log('Prepared GitHub Pages marketing page with connected hosted destinations.');
