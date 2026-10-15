// No visible view owns these schedulers. Main supervises this local process.
window.__BONZAI_COMPANY_RUNTIME__ = true;
const bridge = window.electronAPI.companyRuntime;
try {
  const [company, scheduler, streams] = await Promise.all([
    import('./services/company.service.js'), import('./services/company/heartbeat.js'), import('./services/company/streamBus.js'),
  ]);
  streams.subscribe(event => bridge.stream(event));
  const refresh = async id => {
    const teams = id ? [await company.getCompany(id)].filter(Boolean) : await company.listCompanies();
    for (const team of teams) if (team.status === 'active') scheduler.wake(team.id);
  };
  window.electronAPI.db.issues.onChanged(event => { void refresh(event?.companyId).catch(console.error); });
  window.electronAPI.db.companies.onChanged(async event => {
    const teams = event?.companyId ? [await company.getCompany(event.companyId)].filter(Boolean) : await company.listCompanies();
    if (!(await window.electronAPI.workspace.status()).unlocked) return;
    for (const team of teams) {
      if (team.status === 'active') scheduler.start(team); else scheduler.stop(team.id);
    }
  });
  bridge.onCommand(async ({ requestId, name, args }) => {
    try {
      let value;
      const [id, extra] = args;
      if (name === 'boot') value = await company.listCompanies();
      else if (name === 'stop') scheduler.stop(id);
      else if (name === 'wake') scheduler.wake(id);
      else if (name === 'start') {
        const team = await company.getCompany(id);
        if (team?.status === 'active') scheduler.start(team); else scheduler.stop(id);
      } else if (name === 'tickCEO') value = await company.tickNow(id);
      else if (name === 'tickRole') value = await company.tickRoleNow(id, extra);
      else if (name === 'approve') value = await company.approveAction(id, extra);
      else if (name === 'workerValidate') value = await (await import('./services/agentWorkerRuntime.js')).validateWorkerBinding(id, extra);
      else if (name === 'workerIdentity') value = await (await import('./services/agentWorkerRuntime.js')).resolveWorkerIdentity(id);
      else if (name === 'workerSignature') value = await (await import('./services/agentWorkerRuntime.js')).verifyWorkerSignature(id);
      else if (name === 'workerVerifyJob') value = await (await import('./services/agentWorkerRuntime.js')).verifyWorkerJob(id, extra);
      else if (name === 'workerExecute') value = await (await import('./services/agentWorkerRuntime.js')).executeWorkerCapability(id, extra);
      else throw new Error('Unknown runtime command.');
      bridge.result({ requestId, value: JSON.parse(JSON.stringify(value ?? null)) });
    } catch (error) { bridge.result({ requestId, error: error.message }); }
  });
  const publishState = async () => {
    const teams = await company.listCompanies();
    bridge.stream({ type: 'runtime-state', activeTeams: teams.filter(team => team.status === 'active').length });
  };
  const canRun = async () => (await window.electronAPI.workspace.status()).unlocked;
  if (await canRun()) await company.bootAll();
  let previouslyUnlocked = await canRun();
  setInterval(async () => {
    const unlocked = await canRun();
    if (unlocked && !previouslyUnlocked) await company.bootAll();
    previouslyUnlocked = unlocked;
  }, 5000);
  await publishState();
  setInterval(() => { void publishState().catch(console.error); }, 5000);
  bridge.ready();
  window.addEventListener('beforeunload', () => scheduler.stopAll());
} catch (error) { bridge.ready(error.message); }
