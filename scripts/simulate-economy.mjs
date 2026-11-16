import { simulateEconomy } from '../src/shared/economySimulation.js';
import fs from 'node:fs';
const path=process.argv[2];
const assumptions=path?JSON.parse(fs.readFileSync(path,'utf8')):{};
console.log(JSON.stringify(simulateEconomy(assumptions),null,2));
