import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { SUITE_VERSION, selectScenarios } from '../../shared/benchmark/scenarios.js';
import fixture from '../../shared/benchmark/fixture.json' with { type: 'json' };

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function comparisonKey(recipe, env, appVersion) {
  // Accelerator build suffixes and hardware placement differ across operating
  // systems. Keep them in the report, but compare the same release/workload.
  const packages = Object.fromEntries(Object.entries(env.packages || {}).map(([k,v]) => [k, String(v).split('+')[0]]));
  const settings = Object.fromEntries(Object.entries(env.settings || {}).filter(([k]) => !['ngl','threads'].includes(k)));
  return digest({recipe, files:env.files, settings, implementation:env.implementation, packages, appVersion});
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Main-process runner: survives view navigation; never cancels someone else's work. */
export function createScenarioRunner({ journal, hardware, version, environment, execute, idle, notify = () => {}, wait = sleep }) {
  let active = null;
  const state = () => active ? { id: active.id, stopping: active.stopping } : null;
  async function start({ categories, scenarioIds, h3LicenseAccepted = false } = {}) {
    if (active) throw new Error('A standardized benchmark is already running.');
    const selected = selectScenarios(categories, scenarioIds);
    // Reserve synchronously so two IPC clicks cannot race the hardware probe.
    active = { id: null, stopping: false };
    let session;
    try {
      session = journal.start(await hardware(), version(), { categories, mode: 'standardized' });
      active.id = session.id;
    } catch (error) { active = null; throw error; }
    const run = active;
    const suite = {
      version: SUITE_VERSION, phase: 'Preparing', current: null, completed: 0,
      total: selected.length * 3, warmups: 1, repetitions: 2,
      methodology: 'One first pass excluded from statistics, then two measured passes per scenario. Each pass includes endpoint loading, queueing, execution and export. No forced unload or cold-start claim. Compare only matching scenario comparison keys; seeds do not guarantee identical pixels across backends.',
      cases: selected.map(item => ({
        id: item.id, label: item.label, group: item.group, pipeline: item.pipeline,
        params: item.params, fixture: item.fixture ? fixture.name : null,
        recipeHash: digest({ version: SUITE_VERSION, item, fixture: item.fixture ? fixture.image : null }),
        status: 'pending', trials: [],
      })),
    };
    const save = () => { journal.updateSuite(run.id, suite); notify(run.id, suite); };
    try { save(); }
    catch (error) { active = null; journal.stop(); throw error; }
    // Detached from the IPC response, but all errors are recorded and finalized.
    void (async () => {
      try {
        for (let index = 0; index < selected.length && !run.stopping; index++) {
          const item = selected[index], entry = suite.cases[index];
          suite.current = item.label;
          suite.phase = 'Checking local models and fingerprints';
          entry.status = 'preparing'; save();
          if (item.license && !h3LicenseAccepted) {
            entry.status = 'skipped'; entry.reason = 'Accept H3 terms in setup to include this scenario.'; save(); continue;
          }
          let env;
          try { env = await environment(item); }
          catch { env = { ready: false, reason: 'Local runtime unavailable. Start the AI server and check required models.' }; }
          if (!env.ready) {
            entry.status = 'skipped'; entry.reason = env.reason; save(); continue;
          }
          entry.environment = env;
          entry.comparisonKey = comparisonKey(entry.recipeHash, env, version());
          entry.status = 'running'; save();
          for (let pass = 0; pass < 3 && !run.stopping; pass++) {
            suite.phase = 'Waiting for other work to finish'; save();
            while (!run.stopping && !(await idle())) await wait(3000);
            if (run.stopping) break;
            suite.phase = pass === 0 ? 'First pass (not scored)' : `Measured pass ${pass} of 2`; save();
            const phase = pass === 0 ? 'warmup' : 'measurement';
            const finish = journal.begin(item.pipeline, item.params, env.model || null, { scenario: item.id, phase, repetition: pass });
            const interference = journal.interferenceCount(run.id);
            const started = performance.now();
            let result;
            try {
              result = await execute(item, { ...(item.fixture ? { image_base64: fixture.image } : {}), ...(item.license ? { license_accepted: true } : {}) }, env);
            } catch {
              result = { status: 'failed', reason: 'Generation failed. Check the local server logs; no private error content is included in the report.' };
            }
            if (journal.interferenceCount(run.id) > interference) {
              result = { ...result, status: 'contended', reason: 'Another inference request overlapped this test. Repeat the scenario on an idle machine.' };
            }
            const metrics = { ...result.metrics, elapsedMs: Math.round(performance.now() - started) };
            const trial = { phase, repetition: pass, status: result.status, metrics, reason: result.reason || null };
            finish?.(result.status, metrics);
            entry.trials.push(trial); suite.completed++;
            if (result.halt) run.stopping = true;
            save();
            if (result.status !== 'completed') {
              entry.status = result.status === 'busy' ? 'blocked' : 'failed';
              entry.reason = result.reason || 'This scenario did not finish successfully.';
              break;
            }
          }
          if (entry.status === 'running') {
            if (!run.stopping) {
              const after = await environment(item);
              const afterKey = comparisonKey(entry.recipeHash, after, version());
              if (!after.ready || afterKey !== entry.comparisonKey) {
                entry.status = 'invalidated';
                entry.reason = 'Model files or runtime settings changed during the scenario.';
              }
            }
            if (entry.status === 'running') entry.status = run.stopping ? 'cancelled' : 'completed';
          }
          save();
        }
        for (const entry of suite.cases) if (['pending','preparing'].includes(entry.status)) entry.status = 'cancelled';
        suite.phase = run.stopping ? 'Stopped' : 'Finished';
      } catch {
        suite.phase = 'Failed'; suite.error = 'Benchmark interrupted by a local runtime or storage error.';
        for (const entry of suite.cases) if (['running','preparing','pending'].includes(entry.status)) entry.status = 'interrupted';
      } finally {
        try { save(); journal.stop(); } finally { active = null; notify(run.id, suite, true); }
      }
    })().catch(() => {
      // Disk failures must not cause an unhandled main-process rejection.
      active = null;
      try { journal.stop(); } catch {}
      try { notify(run.id, { ...suite, phase: 'Failed' }, true); } catch {}
    });
    return session;
  }
  function stop() {
    if (active) { active.stopping = true; return true; }
    return false;
  }
  return { start, stop, state };
}
