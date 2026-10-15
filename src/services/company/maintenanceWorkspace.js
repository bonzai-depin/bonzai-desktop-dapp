const CLOSED_WORK_ORDER_STATUSES = new Set(["completed", "cancelled"]);

function count(value) {
  return Number(value || 0);
}

export function isMaintenanceWorkspace(charter = {}) {
  return charter?.template?.id === "hvac_residential";
}

export function maintenanceChannels(gmao = {}) {
  const kpis = gmao?.kpis || {};
  return [
    {
      key: "dispatch",
      value: "gmao",
      focus: "work-orders",
      label: "Dispatch",
      icon: "assignment",
      badge: count(kpis.openWorkOrders) || null,
      description: "Triage incoming requests, assign technicians, and keep every intervention moving.",
    },
    {
      key: "preventive",
      value: "gmao",
      focus: "preventive",
      label: "Preventive",
      icon: "event_repeat",
      badge: count(kpis.duePreventive) || null,
      description: "Plan recurring maintenance before equipment and customer commitments are at risk.",
    },
    {
      key: "sla-risk",
      value: "gmao",
      focus: "cockpit",
      label: "SLA risk",
      icon: "timer",
      badge: count(kpis.slaAtRisk) || null,
      description: "See urgent work, response deadlines, restoration risk, and potential penalties.",
    },
    {
      key: "billing",
      value: "gmao",
      focus: "finance",
      label: "Billing",
      icon: "request_quote",
      badge: count(kpis.serviceAcceptancePending) + count(kpis.invoicesToSend) || null,
      description: "Move completed interventions through service acceptance, evidence, and invoicing.",
    },
  ];
}

export function maintenanceAttentionCards(gmao = {}, now = Date.now()) {
  const workOrders = Array.isArray(gmao.workOrders) ? gmao.workOrders : [];
  const plans = Array.isArray(gmao.plans) ? gmao.plans : [];
  const slaByOrder = new Map((gmao.sla || []).map((item) => [item.workOrderId, item]));
  const open = workOrders.filter((item) => !CLOSED_WORK_ORDER_STATUSES.has(item.status));
  const atRisk = open.filter((item) => {
    const sla = slaByOrder.get(item.id);
    return item.priority === "P0" || count(sla?.interventionLateMs) > 0 || count(sla?.restorationLateMs) > 0;
  });
  const acceptance = workOrders.filter((item) => item.status === "restored" && !item.serviceAcceptance);
  const duePlans = plans.filter((item) => item.active && item.nextDueAt && Number(item.nextDueAt) <= now);

  return [
    {
      id: "dispatch",
      channel: "dispatch",
      icon: "assignment",
      tone: atRisk.length ? "danger" : "neutral",
      eyebrow: "Dispatch",
      title: atRisk.length ? `${atRisk.length} urgent intervention${atRisk.length === 1 ? "" : "s"}` : `${open.length} open intervention${open.length === 1 ? "" : "s"}`,
      detail: atRisk[0]
        ? `${atRisk[0].workOrderNumber || "Work order"} · ${atRisk[0].title || "Response required"}`
        : open.length ? "The active queue is within its current service targets." : "No intervention is waiting for dispatch.",
      action: "Open dispatch",
    },
    {
      id: "preventive",
      channel: "preventive",
      icon: "event_repeat",
      tone: duePlans.length ? "warning" : "neutral",
      eyebrow: "Preventive",
      title: duePlans.length ? `${duePlans.length} maintenance plan${duePlans.length === 1 ? " is" : "s are"} due` : "Preventive plan is current",
      detail: duePlans[0]?.name || "Upcoming maintenance stays visible to the whole team.",
      action: "Review schedule",
    },
    {
      id: "billing",
      channel: "billing",
      icon: "request_quote",
      tone: acceptance.length ? "warning" : "neutral",
      eyebrow: "Service to cash",
      title: acceptance.length ? `${acceptance.length} service acceptance${acceptance.length === 1 ? "" : "s"} missing` : "Completed work is ready to reconcile",
      detail: acceptance[0]
        ? `${acceptance[0].workOrderNumber || "Work order"} needs customer acceptance before invoicing.`
        : "Evidence, acceptance, quotes, and invoices remain linked to each intervention.",
      action: "Open billing",
    },
  ];
}
