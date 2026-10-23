/** Contract arithmetic is explicit, versioned and independent of model output. */
export const CCTP_PRICING_RULES = Object.freeze([
  {
    id: "chiller",
    section: "ST1",
    label: "Groupes froids",
    thresholdCents: 150000,
  },
  {
    id: "air_conditioner",
    section: "ST1",
    label: "Climatiseurs / déshumidificateurs",
    thresholdCents: 50000,
  },
  {
    id: "other_cooling",
    section: "ST1",
    label: "Autres équipements ST1",
    thresholdCents: 10000,
  },
  {
    id: "kitchen_hood",
    section: "ST2",
    label: "Hottes de cuisine",
    thresholdCents: 30000,
  },
  {
    id: "air_handler",
    section: "ST2",
    label: "Centrales de traitement d’air",
    thresholdCents: 30000,
  },
  {
    id: "other_ventilation",
    section: "ST2",
    label: "Autres équipements ST2",
    thresholdCents: 10000,
    requiresResolution: true,
  },
  {
    id: "pressure",
    section: "ST3",
    domain: "ESP",
    label: "Équipements sous pression",
    thresholdCents: 30000,
  },
]);

export function validatePricingProfile(
  input,
  { confirmed = false, now = Date.now() } = {},
) {
  if (input?.id === 'contract') return validateCustomProfile(input, {confirmed,now});
  if (
    !confirmed ||
    !String(input?.validatedBy || "").trim() ||
    !String(input?.reference || "").trim()
  )
    throw new Error(
      "Validez les règles tarifaires avec un responsable et une référence contractuelle.",
    );
  if (!["included", "billable"].includes(input.accessAboveThreshold))
    throw new Error(
      "Précisez le traitement des moyens de levage au-delà de la franchise.",
    );
  const coefficient = Number(input.coefficient);
  if (!Number.isFinite(coefficient) || coefficient <= 0 || coefficient > 100)
    throw new Error("Coefficient contractuel invalide.");
  return {
    id: "cctp_25_004",
    version: 1,
    reference: input.reference.trim(),
    validatedBy: input.validatedBy.trim(),
    validatedAt: now,
    coefficient,
    accessAboveThreshold: input.accessAboveThreshold,
    ventilationResolution: String(input.ventilationResolution || "").trim(),
    rules: CCTP_PRICING_RULES.map((rule) => ({ ...rule })),
    includedLaborHours: 8,
    travelIncluded: true,
  };
}

export function calculateContractQuote(input, profile, asset) {
  if (profile?.id === 'contract') return calculateCustomQuote(input,profile,asset);
  if (
    profile?.id !== "cctp_25_004" ||
    profile.version !== 1 ||
    !profile.validatedAt ||
    !profile.validatedBy
  )
    throw new Error("Le profil tarifaire du contrat doit être validé.");
  const rule = CCTP_PRICING_RULES.find(
    (item) => item.id === input.pricingCategory,
  );
  if (
    !rule ||
    !asset ||
    asset.technicalSection !== rule.section ||
    (rule.domain && asset.domainCode !== rule.domain)
  )
    throw new Error(
      "Choisissez une catégorie tarifaire correspondant à l’équipement.",
    );
  if (asset.domainCode === "REG")
    throw new Error("Utilisez le profil gaz validé pour cet équipement.");
  if (rule.requiresResolution && !profile.ventilationResolution)
    throw new Error(
      "La fiche ST2 indique > 100 € dans les deux branches. Enregistrez la clarification contractuelle avant de calculer ce devis.",
    );
  for (const key of ["partsCents", "laborCents", "travelCents", "accessCents"])
    if (!Number.isSafeInteger(input[key] ?? 0) || (input[key] ?? 0) < 0)
      throw new Error("Montants HT invalides.");
  const vatRate = Number(input.vatRate ?? 0);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)
    throw new Error("TVA invalide.");
  const parts = input.partsCents ?? 0,
    labor = input.laborCents ?? 0;
  const included = parts <= rule.thresholdCents;
  const hours = Number(input.laborHours);
  if (!included && labor && (!Number.isFinite(hours) || hours <= 0))
    throw new Error(
      "Renseignez les heures de main-d’œuvre pour appliquer la limite de 8 heures.",
    );
  const includedLaborCents = included
    ? labor
    : Math.round(labor * Math.min(1, 8 / (hours || 1)));
  const chargeablePartsCents = Math.max(0, parts - rule.thresholdCents);
  const partsAfterCoefficientCents = Math.round(
    chargeablePartsCents * profile.coefficient,
  );
  const access =
    profile.accessAboveThreshold === "billable" ? (input.accessCents ?? 0) : 0;
  const subtotalCents = included
    ? 0
    : partsAfterCoefficientCents + labor - includedLaborCents + access;
  const vatCents = Math.round((subtotalCents * vatRate) / 100);
  if (!Number.isSafeInteger(subtotalCents + vatCents))
    throw new Error("Montant hors limites.");
  return {
    ...input,
    coefficient: profile.coefficient,
    franchiseCents: rule.thresholdCents,
    chargeablePartsCents,
    partsAfterCoefficientCents,
    includedLaborCents,
    subtotalCents,
    vatRate,
    vatCents,
    totalCents: subtotalCents + vatCents,
    contractTerms: {
      ...rule,
      includedLaborHours: 8,
      travelIncluded: true,
      profileVersion: profile.version,
    },
    formula:
      "Pièces ≤ franchise : inclus ; sinon (pièces − franchise) × K + main-d’œuvre au-delà de 8 h + levage selon validation ; déplacement inclus.",
  };
}

function validateCustomProfile(input,{confirmed,now}) {
  if (!confirmed || !String(input.validatedBy||'').trim() || !String(input.reference||'').trim()) throw new Error('Validez le profil avec son responsable et sa référence contractuelle.');
  const date=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
  if(!date(input.effectiveFrom)||!date(input.effectiveUntil)||input.effectiveFrom>input.effectiveUntil) throw new Error('Période tarifaire invalide.');
  if(!Number.isInteger(input.version)||input.version<1) throw new Error('Numéro de version requis.');
  if(!Number.isFinite(input.coefficient)||input.coefficient<=0||input.coefficient>100) throw new Error('Coefficient invalide.');
  if(!Number.isFinite(input.includedLaborHours)||input.includedLaborHours<0||input.includedLaborHours>1000) throw new Error('Heures incluses invalides.');
  if(typeof input.travelIncluded!=='boolean' || !['included','billable'].includes(input.accessAboveThreshold) || typeof input.allIncludedBelowThreshold!=='boolean') throw new Error('Précisez les inclusions contractuelles.');
  if(!Number.isFinite(input.vatRate)||input.vatRate<0||input.vatRate>100) throw new Error('TVA contractuelle invalide.');
  if(!Array.isArray(input.rules)||!input.rules.length||input.rules.length>100) throw new Error('Ajoutez les catégories tarifaires.');
  const ids=new Set();
  const rules=input.rules.map(r=>{
    if(!String(r.id||'').trim()||ids.has(r.id)||!String(r.label||'').trim()||!String(r.section||'').trim()||!Number.isSafeInteger(r.thresholdCents)||r.thresholdCents<0) throw new Error('Catégorie ou franchise invalide.');
    ids.add(r.id);return {id:r.id,label:r.label,section:r.section,domain:r.domain||null,thresholdCents:r.thresholdCents};
  });
  return {id:'contract',version:input.version,reference:input.reference.trim(),validatedBy:input.validatedBy.trim(),validatedAt:now,effectiveFrom:input.effectiveFrom,effectiveUntil:input.effectiveUntil,coefficient:input.coefficient,includedLaborHours:input.includedLaborHours,travelIncluded:input.travelIncluded,accessAboveThreshold:input.accessAboveThreshold,allIncludedBelowThreshold:input.allIncludedBelowThreshold,vatRate:input.vatRate,rules};
}
function calculateCustomQuote(input,profile,asset) {
  validateCustomProfile(profile,{confirmed:true,now:profile.validatedAt});
  const date=input.pricingDate||input.date;
  if(!date||date<profile.effectiveFrom||date>profile.effectiveUntil) throw new Error('Ce profil ne couvre pas la date de l’intervention.');
  const rule=profile.rules.find(r=>r.id===input.pricingCategory);
  if(!rule || !asset || rule.section!==asset.technicalSection || (rule.domain && rule.domain!==asset.domainCode)) throw new Error('La catégorie tarifaire ne correspond pas à l’équipement.');
  for(const k of ['partsCents','laborCents','travelCents','accessCents']) if(!Number.isSafeInteger(input[k])||input[k]<0) throw new Error('Renseignez chaque coût HT, y compris les montants nuls.');
  const hours=Number(input.laborHours);
  if(input.laborHours==null||!Number.isFinite(hours)||hours<0||(input.laborCents>0&&hours===0)) throw new Error('Main-d’œuvre et heures incohérentes.');
  const included=profile.allIncludedBelowThreshold && input.partsCents<=rule.thresholdCents;
  const includedLaborCents=included?input.laborCents:Math.round(input.laborCents*Math.min(1,profile.includedLaborHours/(hours||1)));
  const chargeablePartsCents=Math.max(0,input.partsCents-rule.thresholdCents), partsAfterCoefficientCents=Math.round(chargeablePartsCents*profile.coefficient);
  const subtotalCents=included?0:partsAfterCoefficientCents+input.laborCents-includedLaborCents+(profile.travelIncluded?0:input.travelCents)+(profile.accessAboveThreshold==='included'?0:input.accessCents);
  const vatCents=Math.round(subtotalCents*profile.vatRate/100);
  if(!Number.isSafeInteger(subtotalCents+vatCents)) throw new Error('Montant hors limites.');
  return {...input,coefficient:profile.coefficient,franchiseCents:rule.thresholdCents,chargeablePartsCents,partsAfterCoefficientCents,includedLaborCents,subtotalCents,vatCents,vatRate:profile.vatRate,totalCents:subtotalCents+vatCents,contractTerms:{...rule,includedLaborHours:profile.includedLaborHours,travelIncluded:profile.travelIncluded,profileVersion:profile.version,reference:profile.reference,effectiveFrom:profile.effectiveFrom,effectiveUntil:profile.effectiveUntil},formula:'Profil contractuel validé, version '+profile.version};
}
