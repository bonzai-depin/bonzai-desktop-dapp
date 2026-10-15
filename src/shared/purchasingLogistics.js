// Monetary calculations stay deterministic. All values are EUR cents excluding recoverable VAT.
export const LOGISTICS_COSTS = ['freight', 'insurance', 'handling', 'customs', 'duties', 'storage', 'lastMile'];
export const LOGISTICS_STAGES = ['planning', 'booked', 'dispatched', 'delayed', 'delivered'];
export function assessLogistics(plan, quote, at = Date.now()) {
  const warnings = [];
  if (!quote) warnings.push('quote_missing');
  if (quote?.validUntil && quote.validUntil < at) warnings.push('quote_expired');
  let logisticsCents = 0;
  for (const key of LOGISTICS_COSTS) {
    const cost = plan.costs?.find(c => c.category === key);
    if (!cost || cost.status === 'missing') { warnings.push(`missing:${key}`); continue; }
    logisticsCents += cost.amountCents;
    if (cost.status === 'estimated') warnings.push(`estimated:${key}`);
    if (cost.validUntil && cost.validUntil < at) warnings.push(`expired:${key}`);
  }
  // Quote subtotal already contains its freight. The reviewed freight line replaces it.
  const equipmentCents = quote ? quote.subtotalCents - quote.shippingCents : null;
  const expectedCostCents = equipmentCents == null ? null : equipmentCents + logisticsCents + (plan.otherJobCostsCents || 0);
  const adverseCostCents = expectedCostCents == null ? null : expectedCostCents + (plan.contingencyCents || 0);
  const sales = plan.salePriceCents;
  const marginPct = sales > 0 && expectedCostCents != null ? (sales - expectedCostCents) / sales * 100 : null;
  const adverseMarginPct = sales > 0 && adverseCostCents != null ? (sales - adverseCostCents) / sales * 100 : null;
  if (adverseMarginPct != null && adverseMarginPct < plan.targetMarginPct) warnings.push('margin_below_target');
  if (plan.requiredAt && plan.expectedAt && plan.expectedAt > plan.requiredAt) warnings.push('delivery_late');
  if (plan.stage === 'delayed') warnings.push('shipment_delayed');
  return { equipmentCents, logisticsCents, expectedCostCents, adverseCostCents, marginPct, adverseMarginPct,
    suggestedSaleCents: adverseCostCents == null ? null : Math.ceil(adverseCostCents / (1 - plan.targetMarginPct / 100)), warnings };
}

export function logisticsWarningLabel(warning, locale = 'en') {
  const fr = locale === 'fr';
  const [kind, category] = warning.split(':');
  const names = {freight:['Freight','Transport'],insurance:['Insurance','Assurance'],handling:['Handling','Manutention'],customs:['Clearance','Dédouanement'],duties:['Duties/taxes','Droits et taxes'],storage:['Storage','Stockage'],lastMile:['Final delivery','Livraison finale']};
  const certainty = {missing:['Missing cost','Coût manquant'],estimated:['Estimate to confirm','Estimation à confirmer'],expired:['Offer expired','Offre expirée']};
  if (names[category] && certainty[kind]) return `${names[category][fr?1:0]}: ${certainty[kind][fr?1:0]}`;
  const labels = {quote_missing:['Supplier quote not selected','Devis fournisseur non retenu'],quote_expired:['Supplier quote expired','Devis fournisseur expiré'],margin_below_target:['Adverse margin below target','Marge défavorable inférieure à la cible'],delivery_late:['Delivery later than required date','Livraison après la date du besoin'],shipment_delayed:['Shipment delayed','Expédition retardée'],delivery_overdue:['Expected delivery date passed','Date de livraison prévue dépassée']};
  return labels[warning]?.[fr?1:0] || (fr?'Vérification logistique nécessaire':'Logistics review required');
}
