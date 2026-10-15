import { agentAvatarSource } from "../../utils/agentAvatar.js";
import { smartAgentCatalog } from "../smartAgentCatalog.js";
import ariaAvatar from "../../assets/companions/aria.webp";
import kaiAvatar from "../../assets/companions/kai.webp";
import auroreAvatar from "../../assets/companions/aurore.webp";
import maiAvatar from "../../assets/companions/mai.webp";
import marcusAvatar from "../../assets/companions/marcus.webp";
import jamesAvatar from "../../assets/companions/james.webp";
import damonAvatar from "../../assets/companions/damon.webp";
import zaraAvatar from "../../assets/companions/zara.webp";
import jinAvatar from "../../assets/companions/jin.webp";
import priyaAvatar from "../../assets/companions/priya.webp";
import arjunAvatar from "../../assets/companions/arjun.webp";
import sofiaAvatar from "../../assets/companions/sofia.webp";
import miguelAvatar from "../../assets/companions/miguel.webp";

const ROLE_TITLES = {
  CEO: "Coordinator",
  CFO: "Finance",
  CPO: "Product",
  CMO: "Marketing",
  CSO: "Sales",
  COO: "Operations",
  GeneralCounsel: "Legal and compliance",
  DocumentController: "Document management",
  PurchasingManager: "Purchasing manager",
  ContractManager: "Contract manager",
  MaintenancePlanner: "Maintenance planner",
  FieldTechnician: "Field technician",
  QHSE: "Safety and quality",
  RnDLead: "R&D Lead",
  BusinessDevelopment: "Business Development",
  ClientSuccess: "Client Success",
  InvoicingSpecialist: "Invoicing",
  PaymentsSpecialist: "Payments",
  AccountingSpecialist: "Accounting",
  ProcessAnalyst: "Process Analyst",
};

const COMPANION_AVATARS = {
  aria: ariaAvatar,
  kai: kaiAvatar,
  aurore: auroreAvatar,
  mai: maiAvatar,
  marcus: marcusAvatar,
  james: jamesAvatar,
  damon: damonAvatar,
  zara: zaraAvatar,
  jin: jinAvatar,
  priya: priyaAvatar,
  arjun: arjunAvatar,
  sofia: sofiaAvatar,
  miguel: miguelAvatar,
};

export function formatRoleTitle(roleKey) {
  if (!roleKey) return "";
  if (roleKey.startsWith("Producer:")) {
    const pipeline = roleKey.split(":")[1] || "";
    const label = pipeline === "3d"
      ? "3D"
      : pipeline === "fineTune"
        ? "Fine-Tune"
        : titleCase(pipeline);
    return `${label} Producer`;
  }
  return ROLE_TITLES[roleKey] || titleCase(
    String(roleKey)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
  );
}

export function companionAvatar(companion) {
  if (!companion) return null;
  const saved = typeof companion === "object"
    ? companion
    : smartAgentCatalog.agents.find((agent) => agent.id === companion);
  const id = String(saved?.id || companion).toLowerCase();
  const bundledId = saved?.defaultImage?.match(/companions\/([^/]+)\.webp$/)?.[1];
  const fallback = COMPANION_AVATARS[bundledId || id] || null;
  // Saved Vite paths can change between builds; resolve bundled portraits afresh.
  const image = saved?.image || saved?.avatarUrl;
  if (fallback && typeof image === "string" && /(?:^|\/)assets\//.test(image) && !/^(?:https?:|data:|bonzai-blob:)/.test(image)) return fallback;
  return agentAvatarSource(image) || fallback;
}

export function formatModelLabel(value) {
  return String(value || "current model")
    .replace(/^llm_/, "")
    .replace(/_/g, " ")
    .toUpperCase();
}

function titleCase(value) {
  return String(value || "").replace(/\b\w/g, (char) => char.toUpperCase());
}
