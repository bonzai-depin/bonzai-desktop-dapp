import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
const output = process.env.BONZAI_NFT_REVIEW_DIR;
test('published artwork is deterministic, correctly labelled and renderable without a wallet', {skip:!url,timeout:90000}, async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  await page.goto(`${url}/src/assets/fonts/fonts.css`);
  await page.setContent('<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><div id="gallery"></div>');
  const covers = await page.evaluate(async () => {
   const {renderNFTCover,artworkIdentity,nftThemePalette} = await import('/src/services/nftArtwork.js');
   const {themeService}=await import('/src/services/theme.service.js');
   for(const theme of themeService.list()){
    document.documentElement.dataset.theme=theme.id;
    const expected=document.createElement('div');expected.style.backgroundColor='var(--bz-canvas)';document.body.appendChild(expected);
    const expectedColor=getComputedStyle(expected).backgroundColor;
    const palette=nftThemePalette(theme.id);
    if(palette.background!==expectedColor)throw new Error(`${theme.id}: NFT ${palette.background} differs from app ${expectedColor}`);
    const rendered=await renderNFTCover({inferenceType:'training',title:'Theme test',themeId:theme.id});
    const bitmap=await createImageBitmap(new Blob([rendered]));const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    const actual=ctx.getImageData(512,1023,1,1).data;ctx.fillStyle=expectedColor;ctx.fillRect(0,0,1,1);const target=ctx.getImageData(0,0,1,1).data;
    if([...actual].some((v,i)=>Math.abs(v-target[i])>1))throw new Error(`${theme.id}: fade does not end in theme canvas color`);
    bitmap.close();expected.remove();
   }
   const b64 = bytes => {let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value)};
   const fixtures = [
    {id:'text',title:'Letters to Tomorrow',inferenceType:'text',textContent:'We built a small world, then gave it room to grow.'},
    {id:'speech',title:'The Art of Slowing Down',inferenceType:'audio',generation:{type:'speech'}},
    {id:'music',title:'Midnight in Kyoto',inferenceType:'audio',generation:{type:'music'}},
    {id:'video',title:'A World in Motion',inferenceType:'video'},
    {id:'object',title:'Orbital Study',inferenceType:'object',generation:{assetKind:'object'}},
    {id:'level',title:'The Floating District',inferenceType:'object',generation:{assetKind:'level'}},
    {id:'game',title:'Afterlight',inferenceType:'object',generation:{assetKind:'game'}},
    ...['text','speech','music','image','video'].flatMap(modality=>['Checkpoint','LoRA'].map(artifactFormat=>({
     id:`${modality}-${artifactFormat.toLowerCase()}`,title:({text:'A Voice of My Own',speech:'Velvet Narrator',music:'Midnight Sessions',image:'Ink & Light',video:'Slow Cinema'})[modality],
     inferenceType:'training',generation:{modality,artifactFormat,type:'fine-tuned-model'}
    }))),
    {id:'uncensored',title:'Qwen3.5 · Uncensored',inferenceType:'training',generation:{modality:'text',artifactFormat:'Checkpoint',type:'abliterated-model'}},
   ];
   const results=[];
   for(const fixture of fixtures){ const bytes=await renderNFTCover(fixture);const blob=new Blob([bytes]);const bitmap=await createImageBitmap(blob);
    if(bitmap.width!==1024||bitmap.height!==1024)throw new Error('Cover must be 1024 square');bitmap.close();
    results.push({...fixture,label:artworkIdentity(fixture).label,data:`data:image/png;base64,${b64(bytes)}`});
   }
   const source=document.createElement('canvas');source.width=1200;source.height=600;
   const sourceCtx=source.getContext('2d');sourceCtx.fillStyle='#ff0000';sourceCtx.fillRect(0,0,600,600);sourceCtx.fillStyle='#0000ff';sourceCtx.fillRect(600,0,600,600);
   const custom=await renderNFTCover({inferenceType:'object',title:'Geometry',customThumbnail:source.toDataURL()});
   const decoded=await createImageBitmap(new Blob([custom]));const check=document.createElement('canvas');check.width=check.height=1024;const pixels=check.getContext('2d');pixels.drawImage(decoded,0,0);
   if(pixels.getImageData(20,340,1,1).data[0]<180||pixels.getImageData(1000,340,1,1).data[2]<180)throw new Error('Source image was cropped or replaced');decoded.close();
   const repeat = await renderNFTCover(fixtures[0]);if(b64(repeat)!==results[0].data.split(',')[1])throw new Error('Non-deterministic export');
   await renderNFTCover({inferenceType:'training',title:'LongUnbrokenModelName'.repeat(30),generation:{modality:'video',artifactFormat:'LoRA'}});
   const portrait=await(await fetch('/src/assets/companions/priya.webp')).arrayBuffer();
   const art=await(await fetch('/src/assets/bonzai_image.webp')).arrayBuffer();
   results.splice(1,0,{id:'image',label:'Image · Original Artwork',data:`data:image/webp;base64,${b64(new Uint8Array(art))}`});
   results.splice(8,0,{id:'agent',label:'Smart Agent · Original Portrait',data:`data:image/webp;base64,${b64(new Uint8Array(portrait))}`});
   return results;
  });
  assert.equal(covers.length,20);
  if(output){
   await mkdir(output,{recursive:true});
   const fontCSS = `@font-face{font-family:'Fira Sans';src:url(data:font/ttf;base64,${(await readFile(new URL('../src/assets/fonts/FiraSans-Regular.ttf',import.meta.url))).toString('base64')})}@font-face{font-family:'Fira Sans Condensed';font-style:italic;font-weight:900;src:url(data:font/ttf;base64,${(await readFile(new URL('../src/assets/fonts/FiraSansCondensed-BlackItalic.ttf',import.meta.url))).toString('base64')})}`;
   for(const cover of covers) await writeFile(`${output}/${cover.id}.${cover.data.startsWith('data:image/webp')?'webp':'png'}`,Buffer.from(cover.data.split(',')[1],'base64'));
   const style=`${fontCSS}body{margin:0;background:#09111d;color:#f5f1e7;font-family:'Fira Sans',sans-serif;padding:40px}h1{font:italic 900 44px 'Fira Sans Condensed';margin:0 0 12px}p{color:#afbdc8;margin:0 0 32px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}figure{margin:0;min-width:0}img{display:block;width:100%;height:360px;object-fit:contain;background:#050c15;border-radius:10px}@media(max-width:800px){section{grid-template-columns:repeat(2,1fr)}body{padding:20px}}@media(max-width:500px){section{grid-template-columns:1fr}}figcaption{font-size:15px;padding:12px 0 4px}small{color:#afbdc8}`;
   for(const [group,entries] of [['content',covers.filter(x=>!x.id.includes('-')&&x.id!=='uncensored')],['models',covers.filter(x=>x.inferenceType==='training')]]){
    const html=`<style>${style}</style><h1>${group==='content'?'The BonzAI Collection':'Models · Checkpoints & LoRAs'}</h1><p>Production cover renderer · Illustrative titles and assets · Nothing minted or uploaded</p><section>${entries.map(c=>`<figure><img src="${c.data}" alt="${c.label}"><figcaption>${c.label}${c.generation?.modality?' · '+c.generation.modality:''}</figcaption><small>${c.id==='agent'||c.id==='image'?'Original media preserved':c.inferenceType==='training'?'Model identity and provenance':c.id==='text'?'Text excerpt included':'Collection cover · Uses actual snapshot when available'}</small></figure>`).join('')}</section>`;
    await page.setContent(`<link rel="stylesheet" href="/src/assets/fonts/fonts.css">${html}`);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:`${output}/${group}-gallery.png`,fullPage:true});
    await writeFile(`${output}/${group}-gallery.html`,`<!doctype html><meta charset="utf-8"><title>BonzAI NFT rendering review</title>${html}`);
   }
  }
 } finally {await browser.close()}
});
