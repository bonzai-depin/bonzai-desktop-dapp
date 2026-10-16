// Close owned listeners before quitting, including long-running HTTP connections.
export function closeHttpServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

// Electron does not await async before-quit listeners. Gate quit exactly once.
export function installShutdown(app, cleanup, report = console.error) {
  let pending = false;
  let complete = false;
  app.on('before-quit', event => {
    if (complete) return;
    event.preventDefault();
    if (pending) return;
    pending = true;
    Promise.resolve().then(cleanup).catch(report).finally(() => {
      complete = true;
      app.quit();
    });
  });
}
