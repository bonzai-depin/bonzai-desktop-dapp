/** Cancel only the transfers tracked by the requesting workspace. */
export async function cancelLocalDownloads({ filenames = [], pipelineIds = [], apiBase, electronAPI = globalThis.window?.electronAPI, request = globalThis.fetch } = {}) {
  const work = [
    ...[...new Set(filenames.filter(Boolean))].map(async filename => {
      if (!electronAPI?.cancelModelDownload) throw new Error('Download cancellation is unavailable.');
      const accepted = await electronAPI.cancelModelDownload(filename);
      if (accepted === false) {
        const active = await electronAPI.getActiveDownloads?.();
        if (!active || active.some(item => item.filename === filename && !['completed', 'cancelled', 'failed'].includes(item.status))) {
          throw new Error('The download could not be stopped. Retry cancellation.');
        }
      }
    }),
    ...[...new Set(pipelineIds.filter(Boolean))].map(async id => {
      const response = await request(`${apiBase}/downloads/cancel/${encodeURIComponent(id)}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (!response.ok && response.status !== 404) throw new Error('The download could not be stopped. Retry cancellation.');
    }),
  ];
  const results = await Promise.allSettled(work);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
