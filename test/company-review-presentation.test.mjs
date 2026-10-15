import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { artifactText, artifactLanguage, artifactTitle } from '../src/services/company/artifactPresentation.js';
import { inboxItems } from '../src/services/company/inboxPresentation.js';
import { bonzaiCodeBlockPlugin } from '../src/shared/markdownCode.js';

test('workflow records render structured results as code and preserve ordinary Markdown',()=>{
  const record={pipeline:'skill',payload:'{"tasks":["Inspect filters"],"done":false}'};
  assert.equal(artifactLanguage(record),'json');assert.match(artifactText(record),/\n  "tasks"/);
  assert.equal(artifactLanguage({pipeline:'text',payload:'# Inspection\n\n- Measure flow'}),'');
  assert.equal(artifactLanguage({pipeline:'fineTune',payload:{status:'completed'}}),'json');
  assert.equal(artifactLanguage({pipeline:'3d',meta:{format:'javascript'}}),'javascript');
  assert.equal(artifactTitle({payload:'<think>hidden</think>\n# **Inspection**'}),'Inspection');
});
test('shared code renderer highlights common aliases and escapes generated markup',()=>{
  const md=new MarkdownIt({html:false}).use(bonzaiCodeBlockPlugin);
  const html=md.render('```js\nconst value = "<img src=x onerror=alert(1)>";\n```');
  assert.match(html,/bz-code-token--keyword[^>]*>const/);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/aria-label="Copy code"/);
  assert.match(md.render('```python\n# preserved comment\n```'),/bz-code-token--comment/);
});
test('review queue retains distinct records and hides completed messages until history is requested',()=>{
  const state={approvals:[{id:'same',action:{type:'email.send',subject:'Approval'}}],gmao:{documentIntake:[{id:'same',status:'to_review',originalName:'Quote.pdf'}],outbox:[{id:'draft',status:'draft'},{id:'unknown',status:'unknown'},{id:'sent',status:'delivered'}],notifications:[{id:'ready',deliveryStatus:'ready'}]}};
  const items=inboxItems(state);
  assert.equal(items.length,5);assert.equal(new Set(items.map(item=>item.key)).size,5);
  assert.ok(items.every(item=>item.pending));assert.equal(inboxItems(state,'fr',true).filter(item=>!item.pending).length,1);
  assert.equal(inboxItems(state,'fr')[0].status,'Validation requise');
});
