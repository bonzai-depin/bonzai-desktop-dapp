import { reactive, readonly } from 'vue';
import { ensureGenerationSocket } from './generationStore.js';
import { mergeOperation, generationPatch, terminal } from '../services/activity/operations.js';
const state = reactive({ operations: {}, connected: false, device: null });
export function reportOperation(patch) {
  if (!patch.id) return;
  state.operations[patch.id] = mergeOperation(state.operations[patch.id], patch);
  const ended = Object.values(state.operations).filter(o => terminal(o.status)).sort((a,b)=>b.updatedAt-a.updatedAt);
  ended.slice(30).forEach(o => delete state.operations[o.id]);
}
export function dismissOperation(id) { if (terminal(state.operations[id]?.status)) delete state.operations[id]; }
let dispose = null;
export function startActivityTracking() {
  if (dispose) return dispose;
  const socket = ensureGenerationSocket();
  let tracking = true;
  const coordinatorEvent = record => {
    // Python already supplies richer media progress through genbus.
    if (!tracking || record.kind === 'media') return;
    const id = record.activityId || `inference:${record.id}`;
    if ((state.operations[id]?.coordinatorRevision || 0) > record.revision) return;
    reportOperation({ ...record, id, coordinatorRevision: record.revision, source: 'inference', mode: 'chat',
      title: record.title || (record.kind === 'workflow' ? 'Workflow inference' : 'Generating text'),
      stage: record.status === 'queued' ? 'Waiting for the device' : record.status,
      progress: null, location: 'On this device' });
  };
  const stopCoordinator = window.electronAPI?.onInferenceQueueChanged?.(coordinatorEvent);
  window.electronAPI?.inferenceQueueSnapshot?.().then(records => records.forEach(coordinatorEvent)).catch(() => {});
  const queueEvent = event => {
    const id = `queue:${event.id}`;
    if (event.background) {
      reportOperation({ id, source: 'local-worker', title: event.path.includes('abliteration') ? 'Uncensoring model' : 'Training model',
        status: event.stage, stage: event.stage === 'queued' ? 'Waiting for the device' : event.stage,
        progress: null, location: 'On this device' });
      return;
    }
    if (event.stage !== 'queued') { delete state.operations[id]; return; }
    const media = event.path === '/audio/music' ? 'music' : event.path?.split('/')[1] || 'generation';
    reportOperation({ id, source: 'queue', title: `Queued ${media}`, status: 'queued',
      stage: 'Waiting for the device', progress: null, location: 'On this device' });
  };
  const handlers = {
    inference_queue: queueEvent,
    inference_queue_snapshot: events => {
      const seen = new Set(events.map(event => `queue:${event.id}`));
      for (const op of Object.values(state.operations)) if (op.source === 'queue' && !seen.has(op.id)) delete state.operations[op.id];
      events.forEach(queueEvent);
    },
    connect: () => { state.connected = true; },
    disconnect: () => { state.connected = false; Object.values(state.operations).filter(o=>['generation','queue'].includes(o.source)&&!terminal(o.status)).forEach(o=>reportOperation({id:o.id,stage:'Reconnecting',status:'interrupted'})); },
    gen_started: e => reportOperation(generationPatch(e)),
    gen_progress: e => {
      const id = `generation:${e.generation_id}`;
      if (!state.operations[id]) return;
      reportOperation({id,stage:e.stage,status:e.stage==='queued'?'queued':'running',progress:e.pct??null,step:e.step,total:e.total});
    },
    gen_finished: e => reportOperation({id:`generation:${e.generation_id}`,status:'completed',stage:'Ready',progress:100}),
    gen_error: e => reportOperation({id:`generation:${e.generation_id}`,status:'failed',stage:'Failed',error:e.error}),
    gen_snapshot: e => {
      const seen = new Set();
      for (const job of e.operations || []) {
        const patch = generationPatch(job); seen.add(patch.id);
        reportOperation({...patch,status:job.status || patch.status,stage:job.status==='completed'?'Ready':job.stage,error:job.error,finishedAt:job.finished_at?job.finished_at*1000:null});
      }
      for (const op of Object.values(state.operations)) {
        if (op.source==='generation'&&!terminal(op.status)&&!seen.has(op.id)) reportOperation({id:op.id,status:'interrupted',stage:'Status unavailable'});
      }
    },
  };
  Object.entries(handlers).forEach(([event,fn])=>socket.on(event,fn));
  state.connected = socket.connected;
  socket.emit('activity_snapshot');
  const download = data => {
    if (!data?.filename) return;
    const status = ({error:'failed',failed:'failed',canceled:'cancelled',cancelled:'cancelled',completed:'completed'})[data.status] || 'running';
    reportOperation({id:`download:${data.filename}`,source:'download',title:'Downloading model',stage:status==='running'?(data.phase==='merging'?'Merging':'Downloading'):status,progress:Number.isFinite(data.percent)?data.percent*100:null,status,location:'On this device',error:data.error});
  };
  const stopBenchmark = window.electronAPI?.performanceBenchmark?.onProgress?.(event => {
    reportOperation({ ...event, id: `benchmark:${event.id}`, source: 'benchmark', mode: 'benchmark',
      progress: event.progress?.total ? 100 * event.progress.current / event.progress.total : null,
      location: 'On this device' });
  });
  const stopDownload = window.electronAPI?.onDownloadProgress?.((_event,data) => download(data));
  let stopped = false, timer;
  const base = window.electronAPI?.env?.API_BASE || 'http://127.0.0.1:65000';
  const poll = async () => {
    const observedAt = Date.now();
    const results = await Promise.allSettled([
      window.electronAPI?.getActiveDownloads?.(),
      window.electronAPI?.localExecutionStatus?.(),
      fetch(`${base}/downloads/list`, {signal:AbortSignal.timeout(4000)}).then(r=>r.ok?r.json():Promise.reject(new Error('Unavailable'))),
    ]);
    if (stopped) return;
    if (results[0].status==='fulfilled') {
      const active = results[0].value || [];
      for (const data of active) {
        const previous = state.operations[`download:${data.filename}`];
        if (!previous || previous.updatedAt <= observedAt) download(data);
      }
      for (const op of Object.values(state.operations)) {
        if (op.source==='download' && op.title==='Downloading model' && !terminal(op.status) && op.updatedAt<=observedAt && !active.some(d=>op.id===`download:${d.filename}`)) reportOperation({id:op.id,status:'interrupted',stage:'Status unavailable',progress:null});
      }
    }
    if (results[1].status==='fulfilled') state.device = results[1].value || null;
    else state.device = null;
    if (results[2].status==='fulfilled') for (const p of results[2].value.pipelines||[]) {
      const id = `download:${p.pipeline_id}`;
      // Do not fill recent activity with downloads from earlier application sessions.
      if (['completed','failed','cancelled','canceled'].includes(p.status) && !state.operations[id]) continue;
      const status = ({completed:'completed',failed:'failed',cancelled:'cancelled',canceled:'cancelled',queued:'queued'})[p.status]||'running';
      reportOperation({id,source:'download',title:'Downloading resources',stage:status==='running'?'Downloading':status,status,progress:p.total_progress,location:'On this device'});
    }
    if (results[2].status==='rejected') {
      for (const op of Object.values(state.operations)) if (op.source==='download'&&op.title==='Downloading resources'&&!terminal(op.status)) reportOperation({id:op.id,status:'interrupted',stage:'Reconnecting',progress:null});
    }
    timer = setTimeout(poll,4000);
  };
  poll();
  dispose = () => { tracking=false;stopCoordinator?.();stopped=true;clearTimeout(timer);stopBenchmark?.();stopDownload?.();Object.entries(handlers).forEach(([event,fn])=>socket.off(event,fn));dispose=null; };
  return dispose;
}
export default { state: readonly(state), reportOperation, dismissOperation, startActivityTracking };
