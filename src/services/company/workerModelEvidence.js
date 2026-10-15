// Publisher evidence is NOT a measurement of the shipped GGUF, the BonzAI
// harness, or a customer's device. Do not turn these heterogeneous benchmarks
// into a synthetic capability score. Missing evidence means unknown, not bad.
export const WORKER_EVIDENCE_REVIEWED_AT = '2026-10-10';
const card = (publisher, model) => ({ title: `${publisher} · ${model}`, url: `https://huggingface.co/${publisher}/${model}` });
const qwen = size => card('Qwen', `Qwen3.5-${size}B`);
export const WORKER_MODEL_EVIDENCE = {
  qwen3_5_9b: { sources: [qwen(9)], metrics: { 'IFEval': 91.5, 'BFCL-V4': 66.1, 'TAU2-Bench': 79.1, 'DeepPlanning': 18.0 }, caveat: 'Quantized business-task performance has not been measured.' },
  qwen3_5_4b: { sources: [qwen(4)], metrics: { 'IFEval': 89.8, 'BFCL-V4': 50.3, 'TAU2-Bench': 79.9, 'DeepPlanning': 17.6 }, caveat: 'Quantized business-task performance has not been measured.' },
  qwen3_5_27b: { sources: [qwen(27)], metrics: { 'IFEval': 95.0, 'BFCL-V4': 68.5, 'TAU2-Bench': 79.0, 'DeepPlanning': 22.6 }, caveat: 'Quantized business-task performance has not been measured.' },
  qwen3_5_2b: { sources: [qwen(2)], metrics: { 'IFEval · non-thinking': 61.2, 'IFEval · thinking': 78.6, 'BFCL-V4 · thinking': 43.6 }, caveat: 'Lower-memory models still need business-task validation.' },
  ministral_14b_reasoning: { sources: [card('mistralai', 'Ministral-3-14B-Reasoning-2512')], metrics: {}, caveat: 'Published reasoning settings differ from this worker runtime.' },
  devstral_small_2_24b: { sources: [card('mistralai', 'Devstral-Small-2-24B-Instruct-2512')], metrics: { 'SWE-bench Verified': 68.0, 'Terminal Bench 2': 22.5 }, caveat: 'Coding benchmarks do not validate business workflows or 3D quality.' },
  ministral_8b: { sources: [card('mistralai', 'Ministral-3-8B-Instruct-2512')], metrics: {}, caveat: 'Quantized business-task performance has not been measured.' },
  phi_4_mini: { sources: [card('microsoft', 'Phi-4-mini-instruct')], metrics: {}, caveat: 'Quantized business-task performance has not been measured.' },
  nemotron_3_nano_4b: { sources: [card('nvidia', 'NVIDIA-Nemotron-3-Nano-4B-BF16')], metrics: { 'BFCL v3 · reasoning-off': 61.1, 'IFEval-Prompt · reasoning-off': 82.8 }, caveat: 'The publisher documents English support; other languages need validation.' },
  hermes_4_14b: { sources: [card('NousResearch', 'Hermes-4-14B')], metrics: {}, caveat: 'Quantized business-task performance has not been measured.' },
};

export function workerModelEvidence(model) {
  const entry = Object.hasOwn(WORKER_MODEL_EVIDENCE, model?.baseKey) ? WORKER_MODEL_EVIDENCE[model.baseKey] : null;
  return { status: entry ? 'publisher-reviewed' : 'unassessed', locallyValidated: false,
    reviewedAt: entry ? WORKER_EVIDENCE_REVIEWED_AT : null,
    sources: entry?.sources || [], metrics: entry?.metrics || {}, caveat: entry?.caveat || 'This model has not been assessed for company work.' };
}

// Explicit requirements for the roles in charter.js. Match responsibilities,
// not fragments of a job title. Unknown/custom roles require a manual choice.
export const WORKER_ROLE_PROFILES = {
  CEO: 'planning', CFO: 'finance', CPO: 'planning', COO: 'planning',
  CMO: 'communication', CSO: 'communication', BusinessDevelopment: 'communication', ClientSuccess: 'communication',
  InvoicingSpecialist: 'finance', PaymentsSpecialist: 'finance', AccountingSpecialist: 'finance', BillingController: 'finance',
  ProcessAnalyst: 'planning', GeneralCounsel: 'documents', RnDLead: 'planning',
  PurchasingManager: 'purchasing', MaintenanceContractManager: 'documents',
  MaintenancePlanner: 'operations', DispatchCoordinator: 'operations', QHSEManager: 'documents', DocumentController: 'documents',
  FieldTech: 'operations', Packer: 'operations',
  'Producer:text': 'communication', 'Producer:skill': 'coding',
  'Producer:image': 'media', 'Producer:audio': 'media', 'Producer:video': 'media',
  'Producer:3d': 'media', 'Producer:music': 'media', 'Producer:vision': 'media', 'Producer:fineTune': 'media',
};

const GENERAL = ['qwen3_5_9b', 'qwen3_5_4b'];
const ANALYSIS = ['qwen3_5_27b', ...GENERAL];
export const WORKER_PROFILES = {
  planning: { reason: 'Planning, document review and careful decisions.', models: ANALYSIS, requirements: ['Planning and delegation', 'Cross-team coordination', 'Evidence-grounded decisions'] },
  finance: { reason: 'Planning, document review and careful decisions.', models: ANALYSIS, requirements: ['Financial reconciliation', 'Record extraction', 'Evidence-grounded decisions'] },
  documents: { reason: 'Planning, document review and careful decisions.', models: ANALYSIS, requirements: ['Document review', 'Record extraction', 'Evidence-grounded decisions'] },
  purchasing: { reason: 'Planning, document review and careful decisions.', models: ANALYSIS, requirements: ['Financial reconciliation', 'Scheduling and constraints', 'Cross-team coordination'] },
  operations: { reason: 'Scheduling, record updates and everyday tool use.', models: GENERAL, requirements: ['Scheduling and constraints', 'Tool execution', 'Evidence-grounded decisions'] },
  communication: { reason: 'Customer conversations and clear written deliverables.', models: GENERAL, requirements: ['Customer communication', 'Record extraction', 'Tool execution'] },
  coding: { reason: 'Code, technical problem solving and software tasks.', models: ['devstral_small_2_24b', ...ANALYSIS], requirements: ['Code generation', 'Tool execution', 'Evidence-grounded decisions'] },
  media: { reason: 'Used for new work. Running tasks keep their model. Media tools use their own models.', models: GENERAL, requirements: ['Media tool coordination', 'Tool execution', 'Evidence-grounded decisions'] },
  unknown: { reason: 'This role needs a manual model choice.', models: [], requirements: [] },
};
