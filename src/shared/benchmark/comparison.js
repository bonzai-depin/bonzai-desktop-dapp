import { summarizePipeline } from '../performanceReport.js';
export function scenarioSummary(entry) {
  const trials = (entry.trials || []).filter(t => t.phase === 'measurement');
  const speeds = trials.filter(t => t.status === 'completed').map(t => t.metrics?.tokensPerSecond).filter(n => Number.isFinite(n) && n > 0).sort((a,b) => a-b);
  const tokensPerSecond = speeds.length ? (speeds[Math.floor((speeds.length-1)/2)] + speeds[Math.floor(speeds.length/2)]) / 2 : null;
  return { ...summarizePipeline(trials), tokensPerSecond };
}
export function compareScenario(entry, baseline) {
  const other = baseline?.suite?.cases?.find(c => c.id === entry.id);
  if (!other) return { comparable: false, reason: 'No matching scenario' };
  if (!entry.comparisonKey || entry.comparisonKey !== other.comparisonKey)
    return { comparable: false, reason: 'Different model, software or scenario settings' };
  if (entry.status !== 'completed' || other.status !== 'completed')
    return { comparable: false, reason: 'Both runs must finish successfully' };
  const current = scenarioSummary(entry), previous = scenarioSummary(other);
  if (current.completed !== 2 || previous.completed !== 2 || !(current.medianMs > 0) || !(previous.medianMs > 0))
    return { comparable: false, reason: 'Two measured passes are required' };
  return { comparable: true, baselineMs: previous.medianMs, ratio: previous.medianMs / current.medianMs };
}
export function parseBaseline(text) {
  if (text.length > 10 * 1024 * 1024) throw new Error('Report must be smaller than 10 MiB.');
  const report = JSON.parse(text);
  if (report.mode !== 'standardized' || !Array.isArray(report.suite?.cases) || report.suite.cases.length > 100 ||
      report.suite.cases.some(c => !c || typeof c.id !== 'string' || !Array.isArray(c.trials) ||
        c.trials.some(t => !t || typeof t.status !== 'string' || (t.metrics != null && typeof t.metrics !== 'object'))))
    throw new Error('Choose a standardized benchmark report exported by BonzAI.');
  return report;
}
