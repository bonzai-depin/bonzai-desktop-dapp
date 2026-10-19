import { WORKFLOW_PRESETS } from './workspacePresets.js';
import { workflowTeamPresets } from './workflowTeams.js';
import { templatePresentation } from './templateCatalog.js';

const DEMOS = { hvac_gmao: 'hvac', invoice: 'billing', government_grants: 'grants' };
const INPUTS = {
  hvac_gmao: ['Equipment and sites', 'Service requests'],
  government_grants: ['Application details', 'Supporting documents'],
  purchasing_team: ['Parts requests', 'Supplier quotations'],
  sales_team: ['Customer enquiries', 'Product and service information'],
  leads: ['Prospect details', 'Previous conversations'],
  invoice: ['Approved work', 'Customer and invoice details'],
  collections: ['Unpaid invoices', 'Payment history'],
  payments: ['Invoices', 'Payment records'],
  report: ['Activity records', 'Reporting period'],
  stay_turnover: ['Reservations', 'Property details'],
  stay_guest_messaging: ['Guest messages', 'Property details'],
  stay_maintenance: ['Repair requests', 'Property details'],
  stay_owner_reporting: ['Stay activity', 'Property details'],
};
const SETUP = {
  'meditation-forge': 'Narration currently uses English voices. Artwork is needed for video export.',
  'video-captioning': 'Creates visual descriptions, not speech transcription.',
  'live-streaming': 'Requires a Twitch or TikTok chat connection and OBS. Paid audience requests are not available.',
  'robinhood-portfolio-council': 'Requires a configured brokerage connection. Account changes always need your approval.',
  'tcg-analysis': 'Condition is an estimate. Market price references currently cover Pokémon cards.',
  'chart-forecaster': 'Requires market data. Forecasts are estimates, not guaranteed outcomes.',
};
const MEDIA = { llm: 'Text', image: 'Images', audio: 'Audio', video: 'Video', music: 'Music', vision: 'Image analysis', forecast: 'Forecasting' };
const friendly = key => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());

// Read-only discovery shares the exact setup catalog. It does not instantiate a
// team, download a model, connect a provider or grant workspace execution access.
export function workspaceDiscovery(catalog = [], locale = 'en') {
  const installed = new Map(catalog.map(skill => [skill.id, skill]));
  return [...workflowTeamPresets(catalog), ...WORKFLOW_PRESETS].map(preset => {
    const skill = installed.get(preset.executionWorkflowId);
    const inputs = skill
      ? Object.entries(skill.inputs || {}).map(([key, input]) => typeof input === 'object' && input?.label || friendly(key)).slice(0, 5)
      : INPUTS[preset.id] || ['Source documents', 'Your instructions'];
    return {
      ...templatePresentation(preset, locale),
      catalogInputs: inputs.length ? inputs : ['Your instructions'],
      catalogTools: [...new Set((skill?.requirements?.requiredApis || []).map(api => MEDIA[api] || friendly(api)))],
      demoKind: DEMOS[preset.id] || null,
      hasInstalledWorkflow: Boolean(skill),
      catalogSetup: skill ? SETUP[skill.id.replace(/-v\d.*$/, '')] || '' : '',
    };
  }).sort((a, b) => Number(b.id === 'hvac_gmao') - Number(a.id === 'hvac_gmao'));
}
