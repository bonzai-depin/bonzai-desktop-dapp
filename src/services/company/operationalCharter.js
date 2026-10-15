/** Add the local record tools to existing business roles, preserving user policy. */
export function operationalCharter(charter) {
  if (charter.template?.id === 'government_grants') return {...charter, operationalVersion:3};
  if (charter.operationalVersion >= 3) return charter;
  const needsBaseTools = !charter.operationalVersion;
  const purchasingStaffed = Boolean(
    charter.roles?.PurchasingManager?.companion,
  );
  const roles = Object.fromEntries(
    Object.entries(charter.roles || {}).map(([key, role]) => {
      const skills = new Set(role.grantedSkills || []);
      if (
        needsBaseTools &&
        [
          "CFO",
          "BillingController",
          "InvoicingSpecialist",
          "PaymentsSpecialist",
          "AccountingSpecialist",
        ].includes(key)
      )
        skills.add("skill.local_billing");
      if (
        needsBaseTools &&
        [
          "MaintenanceContractManager",
          "MaintenancePlanner",
          "DispatchCoordinator",
          "FieldTech",
          "QHSEManager",
          "DocumentController",
        ].includes(key)
      )
        skills.add("skill.local_maintenance");
      if (needsBaseTools && key === "DocumentController")
        skills.add("skill.sendgrid_email");
      if (key === "PurchasingManager") {
        if (needsBaseTools) skills.add("skill.local_purchasing");
        if ((charter.operationalVersion || 0) < 2) skills.add("skill.brave_supplier_search");
      }
      if ((charter.operationalVersion || 0) < 2 && purchasingStaffed && ["CFO", "PaymentsSpecialist"].includes(key))
        skills.add("skill.local_purchasing");
      if (["CEO","CFO","BillingController","InvoicingSpecialist","PurchasingManager","MaintenanceContractManager","DocumentController","DispatchCoordinator"].includes(key)) skills.add('skill.local_records');
      return [key, { ...role, grantedSkills: [...skills] }];
    }),
  );
  return {
    ...charter,
    roles,
    operationalVersion: 3,
    grantedSkills: [
      ...new Set([
        ...(charter.grantedSkills || []),
        ...Object.values(roles).flatMap((role) => role.grantedSkills),
      ]),
    ],
  };
}
