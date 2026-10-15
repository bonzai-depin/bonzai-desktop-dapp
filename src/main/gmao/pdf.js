import { BrowserWindow } from "electron";

/** Print an escaped local document; no application renderer or remote resources. */
export async function printLocalPdf(html) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      partition: "gmao-document-preview",
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
  try {
    await win.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(html),
    );
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
    });
  } finally {
    win.destroy();
  }
}
