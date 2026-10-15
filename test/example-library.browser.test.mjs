import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('library filters, pagination, selection and empty state work across themes and widths',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;background:var(--bz-canvas)"><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   const {createApp}=await import('/node_modules/.vite/deps/vue.js');
   const {default:Library}=await import('/src/components/gen3d/ExampleLibrary.vue');
   createApp(Library,{initialKind:'object',onSelect:example=>window.selected=example}).mount('#app');
  });
  await page.getByRole('heading',{name:'Example library'}).waitFor();
  assert.equal(await page.locator('.example-library__card').count(),24);
  await page.getByRole('button',{name:/Show more examples/}).click();
  assert.equal(await page.locator('.example-library__card').count(),48);
  await page.getByLabel('Asset kit',{exact:true}).selectOption('castle');
  assert.equal(await page.locator('.example-library__card').count(),10);
  await page.getByRole('button',{name:/Curtain Wall/}).click();
  assert.match(await page.evaluate(()=>window.selected.prompt),/2 m grid/);
  await page.getByLabel('Creation type',{exact:true}).selectOption('game');
  await page.getByLabel('Game genre',{exact:true}).selectOption('racing');
  assert.equal(await page.locator('.example-library__card').count(),1);
  await page.getByRole('button',{name:/Quarry Time Trial/}).click();
  assert.equal(await page.evaluate(()=>window.selected.kind),'game');
  assert.match(await page.evaluate(()=>window.selected.prompt),/ordered checkpoints/);
  await page.getByRole('searchbox').fill('missingxyz');
  await page.getByText('No examples match these filters.').waitFor();
  await page.getByRole('button',{name:'Reset filters'}).click();
  await page.getByRole('searchbox').fill('cascading fountain');
  assert.equal(await page.locator('.example-library__card').count(),1);
  await page.getByRole('searchbox').fill('');
  for(const theme of ['default','light','terminal']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   for(const width of [1440,800,360]){
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${width}`);
   }
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='default');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/bonzai-example-library.png'});
 }finally{await browser.close();}
});
