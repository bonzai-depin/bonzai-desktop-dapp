import { readFile, writeFile } from 'node:fs/promises';
import { runWorkerProbes } from './worker-model-probes.mjs';

// Use a separately started local inference server. Never load/swap a model or
// connect to the application's live worker pool from this offline assessment.
const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath) {
  console.log('Usage: node scripts/assess-worker-model.mjs /path/to/config.json /path/to/report.json\nUse a dedicated local server; see docs/BONZAI_BACK_OFFICE.md, worker assessment.');
  process.exitCode = 1;
} else {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('A plain loopback HTTP endpoint is required.');
  for (const key of ['model','artifactSha256','quantization','runtimeVersion','contextTokens','device','mtp']) {
    if (config[key] === undefined || config[key] === '') throw new Error(`Missing assessment configuration: ${key}`);
  }
  if (config.dedicatedServer !== true) throw new Error('Use a dedicated server so assessment does not interrupt live teams.');
  const base = endpoint.href.replace(/\/$/, '');
  const available = await fetch(`${base}/models`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!available.ok || !(await available.json()).data?.some(model=>model.id===config.model)) throw new Error('The configured model is not served by this endpoint.');
  const settings = { temperature: config.temperature ?? 0.7, max_tokens: 2048, chat_template_kwargs: { enable_thinking: false } };
  const report = await runWorkerProbes(async prompt => {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], ...settings }),
    });
    if (!response.ok) throw new Error(`Local inference returned HTTP ${response.status}`);
    const result = await response.json();
    return { text: result.choices?.[0]?.message?.content || '', finishReason: result.choices?.[0]?.finish_reason, usage: result.usage };
  }, { repeats: config.repeats ?? 3 });
  await writeFile(outputPath, JSON.stringify({ measuredAt: new Date().toISOString(), operatorReportedConfiguration: config, requestedSettings: settings, ...report }, null, 2) + '\n', { flag: 'wx' });
  console.log(`${report.passed}/${report.total} synthetic probes passed. Report: ${outputPath}. This is not a production certification.`);
  if (report.passed !== report.total) process.exitCode = 2;
}
