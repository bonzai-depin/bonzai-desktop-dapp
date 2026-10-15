import { TEMPLATE_GROUPS } from './templateCatalog.js';

// Workflow IDs remain stable: saved inputs, histories and worker execution still
// resolve against the installed catalog, including user-imported workflows.
export const ROLEPLAY_WORKFLOW_ID = 'roleplay-companion-v1.0.0';

// These describe actual outputs, not new capabilities or automatic permission
// grants. The installed catalog remains the source of availability and execution.
const WORKFLOW_OUTCOMES = {
  'meditation-forge': {
    category: 'wellness', icon: 'spa', outcome: 'A guided meditation ready to listen to',
    frOutcome: 'Une méditation guidée prête à écouter',
    deliverables: ['Guided narration', 'Meditation script', 'Scene artwork'],
    frDeliverables: ['Narration guidée', 'Texte de méditation', 'Illustration de la scène'],
    firstValue: 'Choose an intention, a duration and a setting for your first session.',
    review: 'Listen to the narration and review the script and artwork before sharing.',
  },
  'video-captioning': {
    category: 'media', icon: 'subtitles', outcome: 'Timed visual descriptions with exportable subtitles',
    frOutcome: 'Des descriptions visuelles synchronisées et exportables en sous-titres',
    deliverables: ['SRT visual captions', 'Timed frame descriptions'],
    frDeliverables: ['Descriptions visuelles au format SRT', 'Descriptions des images horodatées'],
    firstValue: 'Open a video and generate the first captions.',
    review: 'Check descriptions and timing before exporting. This workflow describes the images; it does not transcribe speech or burn captions into the video.',
  },
  'finger-frame-director': {
    category: 'media', icon: 'movie_filter', outcome: 'A cinematic effect built from your gesture clip',
    frOutcome: 'Un effet cinématographique créé à partir de votre geste',
    deliverables: ['Composited video', 'Generated scene'],
    frDeliverables: ['Vidéo avec effet intégré', 'Scène générée'],
    firstValue: 'Open a hand-frame clip and describe the world inside the frame.',
    review: 'Review tracking, transitions and the final video before exporting.',
  },
  'live-streaming': {
    category: 'media', icon: 'live_tv', outcome: 'Audience requests turned into live creative content',
    frOutcome: 'Les demandes du public transformées en contenus en direct',
    deliverables: ['Generated stream media', 'OBS media delivery', 'Request queue with keyword filters'],
    frDeliverables: ['Médias générés pour le direct', 'Diffusion des médias dans OBS', 'File de demandes avec filtres de mots-clés'],
    firstValue: 'Connect Twitch or TikTok chat, then map your image, audio and video sources in OBS.',
    review: 'Set keyword filters and review your stream. Paid requests and companion moderation are not available.',
  },
  'tcg-analysis': {
    category: 'collectibles', icon: 'style', outcome: 'An identified card with condition and price evidence',
    frOutcome: 'Une carte identifiée avec une estimation de son état et de son prix',
    deliverables: ['Card identification and photo', 'Estimated condition', 'Available market price references'],
    frDeliverables: ['Identification et photo de la carte', 'État estimé', 'Références de prix disponibles'],
    firstValue: 'Import a clear card photo to identify it and inspect its condition.',
    review: 'Check the card match, visible wear and price sources. Grading is an estimate; market prices are currently available for Pokémon cards only.',
  },
  'mass-chat': {
    category: 'research', icon: 'compare', outcome: 'Several model answers compared in one place',
    frOutcome: 'Les réponses de plusieurs modèles comparées au même endroit',
    deliverables: ['Side-by-side answers', 'Per-model performance metrics'],
    frDeliverables: ['Réponses côte à côte', 'Mesures de performance par modèle'],
    firstValue: 'Ask a question and choose the downloaded models to compare.',
    review: 'Compare accuracy, completeness and speed before choosing a model.',
  },
  'robinhood-portfolio-council': {
    category: 'markets', icon: 'account_balance', outcome: 'Connected brokerage research with reviewed actions',
    frOutcome: 'Une recherche via votre courtier, avec validation des actions',
    deliverables: ['Account and market information', 'Approved action receipts'],
    frDeliverables: ['Informations de compte et de marché', 'Reçus des actions approuvées'],
    firstValue: 'Connect the brokerage tool and choose an available account or market query.',
    review: 'Review the exact action and its parameters before each account change. This workspace does not enforce portfolio limits or run an automatic risk council.',
  },
  'polymarket-top-performers': {
    category: 'markets', icon: 'query_stats', outcome: 'Prediction-market positions backed by source data',
    frOutcome: 'Des positions de marchés prédictifs étayées par les données sources',
    deliverables: ['Trader performance analysis', 'Shared positions', 'Research recommendations'],
    frDeliverables: ['Analyse des performances', 'Positions communes', 'Pistes de recherche'],
    firstValue: 'Select a time period and the traders to analyze.',
    review: 'Inspect sources, concentration and risk before making a decision.',
  },
  'chart-forecaster': {
    category: 'markets', icon: 'show_chart', outcome: 'A price forecast to compare with historical data',
    frOutcome: 'Une prévision de prix à comparer aux données historiques',
    deliverables: ['Historical price chart', 'Forecast series', 'Forecast assumptions'],
    frDeliverables: ['Historique des prix', 'Série de prévisions', 'Hypothèses de prévision'],
    firstValue: 'Choose a stock or cryptocurrency and a forecast horizon.',
    review: 'Check the source, time period and forecast limitations before using the result.',
  },
  'prediction-market-maker': {
    category: 'markets', icon: 'candlestick_chart', outcome: 'A prediction-market proposal with verifiable conditions',
    frOutcome: 'Une proposition de marché prédictif avec des conditions vérifiables',
    deliverables: ['Market definition', 'Verification criteria'],
    frDeliverables: ['Définition du marché', 'Critères de vérification'],
    firstValue: 'Define the outcome and the source that will verify it.',
    review: 'Review the draft and its verification sources. This workspace prepares the proposal; it does not deploy a live market.',
  },
};

const CATEGORY_IDS = new Set(TEMPLATE_GROUPS.filter(group => group.id !== 'all').map(group => group.id));
const CATEGORY_ALIASES = { healthcare: 'wellness', education: 'research', housing: 'property', hospitality: 'property', commercial: 'sales', professional: 'compliance' };
const TAG_CATEGORIES = [
  ['collectibles', ['tcg', 'collector', 'collectibles', 'grading']],
  ['grants', ['grants', 'grant', 'cee', 'incentives']],
  ['accounting', ['accounting', 'tax', 'bookkeeping']],
  ['purchasing', ['purchasing', 'procurement', 'logistics', 'inventory']],
  ['sales', ['sales', 'crm', 'leads']],
  ['operations', ['maintenance', 'hvac', 'cmms', 'gmao']],
  ['markets', ['trading', 'stocks', 'crypto', 'forecasting', 'prediction-markets', 'portfolio']],
  ['finance', ['billing', 'invoicing', 'payments', 'cash-flow']],
  ['wellness', ['meditation', 'wellness', 'mindfulness', 'asmr']],
  ['media', ['video', 'captioning', 'streaming', 'illustration', 'creative', 'music']],
  ['research', ['research', 'benchmarking', 'comparison', 'learning']],
];

function workflowCategory(skill) {
  // Explicit workspace categories win for imported workflows. Legacy "finance"
  // categories are refined by their tags so market research isn't shown as billing.
  const explicit = skill.metadata?.workspaceCategory;
  if (CATEGORY_IDS.has(explicit)) return explicit;
  const tags = new Set((Array.isArray(skill.tags) ? skill.tags : []).map(tag => String(tag).toLowerCase()));
  const matched = TAG_CATEGORIES.find(([, candidates]) => candidates.some(tag => tags.has(tag)));
  if (matched) return matched[0];
  if (CATEGORY_IDS.has(skill.category)) return skill.category;
  return CATEGORY_ALIASES[skill.category] || 'custom';
}

export function workflowTeamPresets(catalog = []) {
  const seen = new Set();
  return catalog.filter(skill => {
    if (!skill?.id || skill.disabled || /^roleplay-companion(?:-v\d.*)?$/.test(skill.id) || seen.has(skill.id)) return false;
    seen.add(skill.id);
    return true;
  }).map(skill => {
    const presentation = WORKFLOW_OUTCOMES[skill.id.replace(/-v\d.*$/, '')];
    const category = presentation?.category || workflowCategory(skill);
    return {
      id: skill.id, executionWorkflowId: skill.id, title: skill.name || skill.id,
      category, icon: presentation?.icon || TEMPLATE_GROUPS.find(group => group.id === category).icon,
      templateId: 'business_ops_team', summary: skill.description || '', pain: '',
      outcome: skill.name || skill.id,
      firstValue: 'Create a task, assign a worker, and review the saved result.',
      review: 'Review inputs, approvals and deliverables in the team workspace.',
      deliverables: ['Saved workflow result'], frDeliverables: ['Résultat du workflow enregistré'],
      ...presentation,
      tags: Array.isArray(skill.tags) ? [...skill.tags] : [],
      businessType: skill.name || '', stakeholders: [], connectors: [], goals: [],
    };
  });
}

export function findWorkflowTeam(companies, target) {
  if (target.companyId) return companies.find(team => team.id === target.companyId);
  return companies.find(team => !team.demoRun && team.workspace?.executionWorkflowId === target.skillId);
}
