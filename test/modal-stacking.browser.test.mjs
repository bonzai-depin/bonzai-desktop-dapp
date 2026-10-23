import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;

test('nested dialogs stay clickable above their parents and restore focus in opening order', {skip:!url,timeout:90000}, async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage();
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<div id="app"></div>');
  await page.evaluate(async()=>{
   const {createApp,h,ref,Teleport}=await import('/node_modules/.vite/deps/vue.js');
   const {useModalAccessibility,suspendModalAccessibility}=await import('/src/composables/useModalAccessibility.js');
   window.suspendDialogs=suspendModalAccessibility;
   const Dialog={props:['level','close'],setup(props){
    const dialog=ref(null),child=ref(false);
    useModalAccessibility(dialog,{onClose:()=>props.close()});
    return ()=>h(Teleport,{to:'body'},[
     h('div',{class:`layer-${props.level}`,style:{position:'fixed',inset:'0',zIndex:props.level===0?10003:250,background:'#123',display:'grid',placeItems:'center'}},[
      h('section',{ref:dialog,role:'dialog','aria-label':`Dialog ${props.level}`},[
       h('button',{onClick:()=>child.value=true},`Open ${props.level+1}`),
       h('button',{onClick:()=>props.close()},`Close ${props.level}`)
      ])
     ]),child.value?h(Dialog,{level:props.level+1,close:()=>child.value=false}):null
    ]);
   }};
   window.testApp=createApp({setup(){const open=ref(false);return()=>[h('button',{onClick:()=>open.value=true},'Start'),open.value?h(Dialog,{level:0,close:()=>open.value=false}):null];}});
   window.testApp.mount('#app');
  });
  for(const width of [1100,390]){
   await page.setViewportSize({width,height:780});
   await page.getByRole('button',{name:'Start',exact:true}).click();
   await page.getByRole('button',{name:'Open 1',exact:true}).click();
   await page.getByRole('button',{name:'Open 2',exact:true}).click();
   assert.equal(await page.getByRole('dialog').count(),1,'only top dialog is accessible');
   await page.getByRole('button',{name:'Close 2',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Open 2');
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Open 1');
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Start');
  }
  await page.evaluate(()=>window.testApp.unmount());
  assert.equal(await page.locator('[inert]').count(),0);
 }finally{await browser.close();}
});
