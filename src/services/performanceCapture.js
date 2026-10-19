// Installed by Electron. Failure to record must never fail inference.
let journal = null;
export function setPerformanceJournal(value) { journal = value; }
export function beginPerformanceSample(pipeline, parameters, model) {
  let finish;
  try { finish = journal?.begin(pipeline, parameters, model); } catch { /* disk unavailable */ }
  return (status, metrics) => { try { finish?.(status, metrics); } catch { /* inference still succeeds */ } };
}
