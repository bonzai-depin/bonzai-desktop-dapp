import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { numbersOnly, PARAMETER_KEYS, METRIC_KEYS } from '../../shared/performanceReport.js';

import catalog from '../../shared/performanceCatalog.json' with { type: 'json' };

export function createPerformanceJournal(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const control = path.join(directory, 'active.json');
  const suiteControl = path.join(directory, 'suite.json');
  const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  const write = (file, data) => {
    const temp = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(temp, file);
  };
  const folder = id => {
    if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('Invalid benchmark ID');
    return path.join(directory, id);
  };
  function list() {
    return fs.readdirSync(directory).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => read(path.join(folder(id), 'report.json'))).filter(Boolean).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
  }
  function recover() {
    // Runs once on application startup, not when opening the view.
    fs.rmSync(control, { force: true });
    fs.rmSync(suiteControl, { force: true });
    for (const session of list()) {
      const dir = folder(session.id);
      for (const file of fs.readdirSync(dir).filter(name => name.startsWith('sample-') && name.endsWith('.json'))) {
        const row = read(path.join(dir, file));
        if (row?.status === 'running') write(path.join(dir, file), { ...row, status: 'interrupted', finishedAt: new Date().toISOString() });
      }
      if (session.status === 'recording') write(path.join(dir, 'report.json'), { ...session, ...(session.suite ? { suite: { ...session.suite, phase: 'Interrupted', cases: session.suite.cases.map(c => ['pending','preparing','running'].includes(c.status) ? {...c, status:'interrupted'} : c) } } : {}), status: 'interrupted', finishedAt: new Date().toISOString() });
    }
  }
  function start(hardware, version, options = {}) {
    const available = [...new Set(catalog.map(p => p.group))];
    const categories = options.categories ?? available;
    if (!Array.isArray(categories) || !categories.length || categories.some(c => !available.includes(c))) throw new Error("Select at least one valid benchmark category");
    const selectedCategories = [...new Set(categories)];
    const pipelines = catalog.filter(p => selectedCategories.includes(p.group)).map(p => p.id);
    const targetControl = options.mode === 'standardized' ? suiteControl : control;
    if (read(targetControl)?.id) throw new Error('A benchmark session is already recording');
    const id = randomUUID();
    fs.mkdirSync(folder(id), { mode: 0o700 });
    const report = { schemaVersion: 1, id, status: 'recording', startedAt: new Date().toISOString(), appVersion: version,
      methodology: options.mode === 'standardized'
        ? 'Versioned fixed scenarios. First pass excluded; two measured passes. Compare only successful cases with matching comparison keys. No output-quality certification.'
        : 'Observed local workloads. Request wall time includes queue and execution where available. Samples are not standardized; no quality certification or cross-hardware score.',
      mode: options.mode === "standardized" ? "standardized" : "observed", hardware, categories: selectedCategories, pipelines, archives: [] };
    write(path.join(folder(id), 'report.json'), report);
    write(targetControl, { id, pipelines, mode: report.mode });
    return report;
  }
  function stop() {
    const targetControl = read(suiteControl)?.id ? suiteControl : control;
    const active = read(targetControl);
    fs.rmSync(targetControl, { force: true });
    if (active?.id) {
      const file = path.join(folder(active.id), 'report.json');
      write(file, { ...read(file), status: 'stopped', finishedAt: new Date().toISOString() });
    }
  }
  function report(id) {
    const dir = folder(id), report = read(path.join(dir, 'report.json'));
    if (!report) throw new Error('Benchmark report not found');
    return { ...report, samples: fs.readdirSync(dir).filter(f => f.startsWith('sample-') && f.endsWith('.json')).map(f => read(path.join(dir, f))).filter(Boolean).sort((a,b) => a.startedAt.localeCompare(b.startedAt)) };
  }
  function begin(pipeline, parameters = {}, model = null, scenario = null) {
    const suite = read(suiteControl);
    const active = scenario ? suite : read(control);
    if (suite?.id && !scenario && !parameters._benchmark) {
      write(path.join(folder(suite.id), `interference-${randomUUID()}.json`), { pipeline, startedAt: new Date().toISOString() });
    }
    if (!active?.id || (active.pipelines && !active.pipelines.includes(pipeline))) return null;
    const id = randomUUID(), started = performance.now();
    const file = path.join(folder(active.id), `sample-${id}.json`);
    const sample = { id, pipeline, ...(scenario || {}), source: parameters._distributed === true ? 'distributed' : 'local', model: model ? path.basename(String(model).replaceAll('\\', '/')) : null,
      startedAt: new Date().toISOString(), status: 'running', parameters: numbersOnly(parameters, PARAMETER_KEYS), quality: 'not-assessed' };
    write(file, sample);
    let ended = false;
    return (status, metrics = {}) => {
      if (ended) return;
      ended = true;
      write(file, { ...sample, status, finishedAt: new Date().toISOString(), metrics: { ...numbersOnly(metrics, METRIC_KEYS), elapsedMs: Math.round(performance.now() - started) } });
    };
  }
  function interferenceCount(id) {
    return fs.readdirSync(folder(id)).filter(name => name.startsWith('interference-')).length;
  }
  function updateSuite(id, suite) {
    const file = path.join(folder(id), 'report.json'), report = read(file);
    if (!report) throw new Error('Benchmark report not found');
    write(file, { ...report, suite });
  }
  function snapshot(id) {
    const source = report(id), copyId = randomUUID();
    fs.mkdirSync(folder(copyId), { mode: 0o700 });
    const { samples, ...metadata } = source;
    write(path.join(folder(copyId), 'report.json'), { ...metadata, id: copyId, sourceId: id, status: 'stopped', finishedAt: new Date().toISOString(), archives: [] });
    for (const row of samples.filter(s => s.status !== 'running')) write(path.join(folder(copyId), `sample-${row.id}.json`), row);
    return report(copyId);
  }
  function updateHardware(id, hardware) {
    const file = path.join(folder(id), 'report.json');
    write(file, { ...read(file), hardware });
  }
  function archive(id, receipt) {
    if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(receipt?.url || '')) throw new Error('Invalid archive receipt');
    const file = path.join(folder(id), 'report.json'), item = read(file);
    if (!item) throw new Error('Benchmark report not found');
    write(file, { ...item, archives: [...item.archives, { url: receipt.url, timestamp: new Date().toISOString() }] });
  }
  return { snapshot, updateHardware, directory, start, stop, list, report, begin, recover, archive, updateSuite, interferenceCount };
}
