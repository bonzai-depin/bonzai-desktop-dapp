import {EXAMPLE_LIBRARY} from '../src/components/gen3d/exampleLibrary.js';
import {auditExampleConstruction,CONSTRUCTION_CATALOGUE} from '../src/components/gen3d/constructionCatalogue.js';
const examples=auditExampleConstruction(EXAMPLE_LIBRARY);
const uncovered=examples.filter(e=>!e.helpers.length);
console.log(JSON.stringify({scope:'Helper routing coverage, not generated-output correctness',helpers:CONSTRUCTION_CATALOGUE.length,
 examples:examples.length,byKind:Object.fromEntries(['object','level','game'].map(kind=>[kind,examples.filter(e=>e.kind===kind).length])),
 uncovered:uncovered.map(e=>e.id),entries:examples},null,2));
if(uncovered.length)process.exitCode=1;
