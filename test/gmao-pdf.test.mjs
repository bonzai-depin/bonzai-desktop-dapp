import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { GAS_CONTRACT_TERMS, calculateGasContractQuote } from "../src/services/company/gmaoProcess.js";
import {calculateContractQuote,validatePricingProfile} from "../src/services/company/contractPricing.js";
import { documentHtml } from "../src/services/company/gmaoDocuments.js";
const require = createRequire(import.meta.url);
const dossier = {
  workOrder: {
    id: "fixture",
    workOrderNumber: "OT-2026-00042",
    clientOiNumber: "OI-0241",
    title: "Remplacement du ventilateur",
    description: "Diagnostic et remise en service de la climatisation.",
    createdAt: Date.UTC(2026, 8, 30),
  },
  site: { name: "Atelier principal", address: "12 rue des Ateliers" },
  client: { name: "Client de démonstration", email: "example@example.invalid" },
};
const record = {
  id: "q42",
  quoteNumber: "DEV-2026-00042",
  createdAt: Date.UTC(2026, 8, 30),
  quoteType: "improvement",
  partsCents: 24000,
  laborCents: 5000,
  travelCents: 2000,
  accessCents: 0,
  coefficient: 1,
  subtotalCents: 31000,
  vatCents: 6200,
  vatRate: 20,
  totalCents: 37200,
};
test("document layout escapes client content and shows contractual charges", () => {
  const html = documentHtml({
    kind: "quote",
    record,
    dossier: { ...dossier, client: { name: "<script>alert(1)</script>" } },
    issuer: "Atelier HVAC",
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("372,00"));
  assert.ok(html.includes("default-src"));
  const adjusted = documentHtml({
    kind: "quote",
    record: {
      ...record,
      quoteType: "outside_bpu",
      partsCents: 24000,
      franchiseCents: 20000,
      coefficient: 1.5,
      subtotalCents: 6000,
      vatCents: 1200,
      totalCents: 7200,
    },
    dossier,
    issuer: "Atelier HVAC",
  });
  assert.ok(adjusted.includes("60,00"));
  assert.ok(adjusted.includes("72,00"));
  assert.ok(!adjusted.includes("240,00"));
});
test("gas quote PDF preserves labour and deduction lines matching its total", () => {
  const computed=calculateGasContractQuote({partsCents:50000,laborCents:120000,laborHours:12,accessCents:10000,travelCents:7500,vatRate:20},{...GAS_CONTRACT_TERMS,validatedAt:1,validatedBy:'Owner',technicalSection:'ST3'});
  const html=documentHtml({kind:'quote',record:{...record,...computed,calculation:{contractTerms:GAS_CONTRACT_TERMS,includedLaborCents:computed.includedLaborCents}},dossier,issuer:'HVAC'});
  assert.match(html,/780,00/);assert.match(html,/650,00/);assert.match(html,/-350,00/);assert.match(html,/-800,00/);assert.ok(!html.includes('75,00'));
});
test(
  "Electron prints the production layout to a real local PDF",
  { skip: !process.env.BONZAI_PDF_SMOKE, timeout: 30000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-document-"));
    const outfile = path.join(dir, "run.cjs");
    const html = documentHtml({
      kind: "quote",
      record,
      dossier,
      issuer: "Atelier HVAC · exemple de recette",
    });
    fs.writeFileSync("/tmp/bonzai-gmao-document-preview.html", html);
    try {
      await build({
        stdin: {
          contents: `import {app} from 'electron';import fs from 'node:fs';import {printLocalPdf} from './src/main/gmao/pdf.js';app.setPath('userData',${JSON.stringify(dir)});app.whenReady().then(async()=>{try{const bytes=await printLocalPdf(${JSON.stringify(html)});if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF');fs.writeFileSync('/tmp/bonzai-gmao-document-preview.pdf',bytes);console.log('Production PDF printed',bytes.length);app.quit();}catch(e){console.error(e);app.exit(1)}});`,
          resolveDir: process.cwd(),
        },
        outfile,
        bundle: true,
        platform: "node",
        format: "cjs",
        external: ["electron"],
      });
      const result = await new Promise((resolve, reject) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(require("electron"), [outfile], { env });
        let output = "";
        child.stdout.on("data", (x) => (output += x));
        child.stderr.on("data", (x) => (output += x));
        child.on("error", reject);
        child.on("exit", (code) => resolve({ code, output }));
      });
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /Production PDF printed/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

test('intervention report preserves visit evidence, measured values, parts and both signatures',()=>{
 const html=documentHtml({kind:'intervention',record:{},issuer:'HVAC',dossier:{...dossier,workOrder:{...dossier.workOrder,restoredAt:100000,unavailableFrom:40000,unavailableUntil:100000},attachments:[{technicianName:'Technician',startedAt:40000,endedAt:100000,diagnosis:'Fault <script>',workPerformed:'Replaced bearing',measurements:[{label:'Pressure',value:2.4,unit:'bar'}],partsUsed:[{brand:'Brand',reference:'REF42',quantity:2,unitPriceCents:1500}],photoRefs:[{stage:'before',documentId:'doc-before',filename:'before.png'}],details:{siteRepresentative:'Site manager',causes:'Bearing worn',consumables:'Grease',finalState:'Operational',safetyConfirmed:true,userInformed:true,registerUpdated:false,checklistChecks:[{label:'Leak test',done:true,note:'Passed'}]}}],maintenance:{signatures:[{role:'technician',name:'Technician',signedAt:100000,confirmed:true,documentId:'sig-tech'},{role:'contract_responsible',name:'Contract manager',signedAt:100000,confirmed:true,evidenceReference:'sig-manager'}]}}});
 for(const expected of ['Site manager','2.4 bar','REF42','15,00','Grease','Operational','doc-before','sig-tech','sig-manager','Durée : 1 min','Fault &lt;script&gt;'])assert.ok(html.includes(expected),expected);
 assert.ok(!html.includes('<script>'));assert.ok(documentHtml({kind:'intervention',record:{},dossier,issuer:'HVAC'}).includes('Aucun compte-rendu'));
});

test('ST1/ST2/ESP pricing PDF uses the applicable franchise and labor cap, never the gas formula',()=>{
 const profile=validatePricingProfile({validatedBy:'Owner',reference:'Contract',coefficient:1.2,accessAboveThreshold:'billable'},{confirmed:true});
 const computed=calculateContractQuote({quoteType:'outside_bpu',pricingCategory:'chiller',partsCents:200000,laborCents:120000,laborHours:12,accessCents:10000,travelCents:8000,vatRate:20},profile,{technicalSection:'ST1',domainCode:'CLIM'});
 const html=documentHtml({kind:'quote',record:{...record,...computed,calculation:{contractProfile:profile,contractTerms:computed.contractTerms,includedLaborCents:computed.includedLaborCents}},dossier,issuer:'HVAC'});
 assert.ok(html.includes('Main-d’œuvre au-delà de 8 h'));assert.ok(html.includes('400,00'));assert.ok(html.replace(/[\s\u202f\u00a0]/g,'').includes('1320,00'));assert.ok(!html.includes('Déduction contractuelle'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('80,00'));
});
