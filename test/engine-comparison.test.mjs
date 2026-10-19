import test from 'node:test';
import assert from 'node:assert/strict';
import {measure,validateConfig} from '../scripts/benchmarks/compare-llm-engines.mjs';
const engine={url:'http://127.0.0.1:8080/v1',name:'fixture',model:'same-base',revision:'abc',quantization:'4bit',runtimeVersion:'test'};
test('engine comparison stays local and requires reproducibility identifiers',()=>{
 assert.doesNotThrow(()=>validateConfig({engines:[engine]}));
 assert.throws(()=>validateConfig({engines:[{...engine,url:'https://example.com/v1'}]}));
 assert.throws(()=>validateConfig({engines:[{...engine,revision:''}]}));
});
const stream=parts=>async()=>new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode(p));c.close();}}));
test('split SSE chunks retain real token usage and JSON quality check',async()=>{
 const result=await measure(engine,{id:'json',prompt:'fixed'}, {fetchImpl:stream(['data: {"choices":[{"delta":{"content":"{\\"customer\\":\\"Acme\\",\\"equipment\\":\\"CR-04\\",\\"temperature_c\\":12,\\"urgency\\":\\"urgent\\"}"}}]}\n','data: {"choices":[{"finish_reason":"stop"}],"usage":{"completion_','tokens":32,"prompt_tokens":14}}\n\ndata: [DONE]\n'])});
 assert.equal(result.completionTokens,32);assert.equal(result.jsonValid,true);assert.ok(result.ttftMs>=0);assert.ok(result.endToEndTokensPerSecond>0);
});
test('missing usage stays unknown; truncated streams never become successful measurements',async()=>{
 const result=await measure(engine,{id:'prose',prompt:'fixed'},{fetchImpl:stream(['data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\ndata: [DONE]\n'])});
 assert.equal(result.completionTokens,null);assert.equal(result.endToEndTokensPerSecond,null);
 await assert.rejects(()=>measure(engine,{id:'prose',prompt:'fixed'},{fetchImpl:stream(['data: {"choices":[{"delta":{"content":"unfinished"}}]}\n'])}),/without completion/);
});
