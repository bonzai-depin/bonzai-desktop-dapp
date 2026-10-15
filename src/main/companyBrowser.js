import { createHash } from "node:crypto";
/** Visible browser sessions have no preload, Node, or access to BonzAI IPC.
 * Only fixed DOM operations are exposed; page content is untrusted evidence.
 * Mutations always need a native owner confirmation, including agent calls.
 */
export function portalUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /^(localhost\.?$|[0-9.]+$|\[|.*\.local\.?$)/i.test(url.hostname)
  )
    throw new Error("A public HTTPS portal URL is required.");
  return url;
}
export function createCompanyBrowser({
  BrowserWindow,
  dialog,
  assertCompany,
  record,
  document,
  context,
  capture,
}) {
  const sessions = new Map(),
    busy = new Set();
  const dossiers = new Map();
  async function confirm(win, message, detail) {
    const result = await dialog.showMessageBox(win, {
      type: "question",
      title: "BonzAI · Browser action",
      message,
      detail,
      buttons: ["Cancel", "Allow once"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response !== 1) throw new Error("Browser action cancelled.");
  }
  function current(companyId) {
    assertCompany(companyId);
    const win = sessions.get(companyId);
    if (!win || win.isDestroyed()) throw new Error("Open a portal first.");
    return win;
  }
  async function inspect(companyId) {
    const win = current(companyId);
    // Isolated world state cannot be replaced by scripts from the portal.
    const page = await win.webContents.executeJavaScriptInIsolatedWorld(999, [
      {
        code: `(() => {
   const visible=e=>!!(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
   const nodes=[...document.querySelectorAll('a,button,input,select,textarea,[role="button"]')].filter(visible).slice(0,250);
   globalThis.bonzaiElements=nodes;
   globalThis.bonzaiSnapshot=crypto.randomUUID();
   return {snapshotId:globalThis.bonzaiSnapshot,title:document.title,text:(document.body?.innerText||'').slice(0,24000),elements:nodes.map((e,id)=>({id,tag:e.tagName,type:e.type||'',label:(e.labels?.[0]?.innerText||e.getAttribute('aria-label')||e.innerText||e.placeholder||e.name||'').slice(0,180),disabled:!!e.disabled,options:e.tagName==='SELECT'?[...e.options].map(o=>({value:o.value,label:o.text})):undefined}))};
  })()`,
      },
    ]);
    return {
      status: "observed",
      url: win.webContents.getURL(),
      ...page,
      untrusted: true,
    };
  }
  async function navigate(companyId, input = {}) {
    assertCompany(companyId);
    const url = portalUrl(input.url);
    if (busy.has(companyId)) throw new Error('Another browser action is pending.');
    if (input.dossierId) context?.(companyId,input.dossierId);
    let win = sessions.get(companyId);
    if (!win || win.isDestroyed()) {
      win = new BrowserWindow({
        show: true,
        width: 1200,
        height: 850,
        title: "BonzAI · Portal",
        webPreferences: {
          partition: `persist:bonzai-company-${createHash("sha256").update(companyId).digest("hex")}`,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      sessions.set(companyId, win);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.session.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      win.webContents.session.setPermissionCheckHandler(() => false);
      win.webContents.on("will-navigate", (event, target) => {
        try {
          portalUrl(target);
        } catch {
          event.preventDefault();
        }
      });
      win.webContents.on("will-redirect", (event, target) => {
        try {
          portalUrl(target);
        } catch {
          event.preventDefault();
        }
      });
      win.on("closed", () => { sessions.delete(companyId); dossiers.delete(companyId); });
      const onDownload = (_event, item) => {
        const dossierId = dossiers.get(companyId);
        // Electron's native Save dialog keeps path selection in the user's hands.
        item.setSaveDialogOptions({ title: "Save portal evidence" });
        item.once("done", async (_e, state) => {
          try {
            const documentId = state === 'completed' && dossierId && capture
              ? await capture(companyId,dossierId,item.getSavePath(),item.getFilename()) : null;
            record(companyId, "browser_event", {
              dossierId, documentId,
              operation: "download",
              status: state,
              filename: item.getFilename(),
              at: Date.now(),
            });
          } catch (error) {
            try { record(companyId, "browser_event", { dossierId, operation: "download", status: "attachment_failed", filename: item.getFilename(), message: error.message, at: Date.now() }); }
            catch { /* The team was deleted during download. */ }
          }
        });
      };
      const browserSession = win.webContents.session;
      browserSession.on("will-download", onDownload);
      win.on("closed", () =>
        browserSession.removeListener("will-download", onDownload),
      );
    }
    win.show();
    await confirm(
      win,
      "Open this portal?",
      `${url.origin}\nThe portal receives your network connection. Sign in and complete CAPTCHA or MFA yourself. Sessions remain on this device.`,
    );
    dossiers.set(companyId,input.dossierId || null);
    await win.loadURL(url.href);
    record(companyId, "browser_event", {
      operation: "navigate",
      dossierId: input.dossierId || null,
      origin: url.origin,
      status: "loaded",
      at: Date.now(),
    });
    return inspect(companyId);
  }
  async function interact(companyId, input = {}) {
    const win = current(companyId);
    if (busy.has(companyId))
      throw new Error("Another browser interaction is awaiting approval.");
    if (
      !["fill", "select", "click"].includes(input.operation) ||
      !Number.isSafeInteger(input.elementId) ||
      input.elementId < 0 ||
      typeof input.snapshotId !== "string"
    )
      throw new Error("Inspect the portal and choose an element first.");
    if (String(input.value || "").length > 12000)
      throw new Error("Field value is too long.");
    busy.add(companyId);
    try {
      const before = win.webContents.getURL();
      await confirm(
        win,
        `Allow portal ${input.operation}?`,
        `${new URL(before).origin}\nElement ${input.elementId}. ${input.operation === "click" ? "This click may submit a form or change an external record. Verify the visible page." : "Review the field and proposed value below."}\n${input.operation === "click" ? "" : String(input.value || "")}`,
      );
      if (win.webContents.getURL() !== before)
        throw new Error(
          "Page changed while awaiting approval. Inspect it again.",
        );
      record(companyId, "browser_event", {
        operation: input.operation,
        origin: new URL(before).origin,
        elementId: input.elementId,
        status: "attempted",
        at: Date.now(),
      });
      await win.webContents.executeJavaScriptInIsolatedWorld(
        999,
        [
          {
            code: `(() => {
    const p=${JSON.stringify({ operation: input.operation, elementId: input.elementId, snapshotId: input.snapshotId, value: String(input.value || "") })};
    const e=globalThis.bonzaiElements?.[p.elementId];
    if(globalThis.bonzaiSnapshot!==p.snapshotId || !e?.isConnected || !e.getClientRects().length || e.disabled) throw new Error('Stale browser element. Inspect again.');
    if(e.type==='password' || e.autocomplete==='one-time-code') throw new Error('Enter credentials and verification codes manually.');
    if(p.operation==='click') e.click();
    else {
     if(!['INPUT','TEXTAREA','SELECT'].includes(e.tagName)||['file','hidden','checkbox','radio','submit'].includes(e.type)) throw new Error('Unsupported field. Use the visible browser.');
     if(p.operation==='select' && (e.tagName!=='SELECT'||![...e.options].some(o=>o.value===p.value))) throw new Error('Choose an observed option.');
     const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
     Object.getOwnPropertyDescriptor(proto,'value').set.call(e,p.value);
     e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
    }
    globalThis.bonzaiSnapshot=null;
   })()`,
          },
        ],
        true,
      );
      return {
        status: "completed",
        summary:
          "Interaction performed. Inspect the portal for the outcome. A click is not proof of submission; never repeat an uncertain submit. Uploads, signatures, CAPTCHA and MFA can be completed in the visible browser.",
      };
    } finally {
      busy.delete(companyId);
    }
  }
  async function uploadDocument(companyId, input = {}) {
    const win = current(companyId),
      doc = document(companyId, input.documentId, dossiers.get(companyId));
    if (busy.has(companyId))
      throw new Error("Another browser action is pending.");
    if (
      !Number.isSafeInteger(input.elementId) ||
      typeof input.snapshotId !== "string"
    )
      throw new Error("Inspect the file input first.");
    busy.add(companyId);
    let attached = false;
    try {
      const before = win.webContents.getURL();
      await confirm(
        win,
        "Upload this document?",
        `${doc.label}\n${new URL(before).origin}\nThis sends the document to this portal.`,
      );
      if (before !== win.webContents.getURL())
        throw new Error("Page changed. Inspect again.");
      const marker = createHash("sha256")
        .update(`${Date.now()}:${input.snapshotId}`)
        .digest("hex");
      await win.webContents.executeJavaScriptInIsolatedWorld(999, [
        {
          code: `(() => {
    const p=${JSON.stringify({ snapshotId: input.snapshotId, elementId: input.elementId })},e=globalThis.bonzaiElements?.[p.elementId];
    if(globalThis.bonzaiSnapshot!==p.snapshotId || !e?.isConnected || e.type!=='file' || e.disabled) throw new Error('Stale file input. Inspect again.');
    e.setAttribute('data-bonzai-upload',${JSON.stringify(marker)});globalThis.bonzaiSnapshot=null;
   })()`,
        },
      ]);
      if (win.webContents.debugger.isAttached())
        throw new Error("Close developer tools before uploading.");
      win.webContents.debugger.attach("1.3");
      attached = true;
      const { root } =
        await win.webContents.debugger.sendCommand("DOM.getDocument");
      const { nodeId } = await win.webContents.debugger.sendCommand(
        "DOM.querySelector",
        { nodeId: root.nodeId, selector: `[data-bonzai-upload="${marker}"]` },
      );
      if (!nodeId) throw new Error("File field disappeared. Inspect again.");
      record(companyId, "browser_event", {
        operation: "upload",
        documentId: doc.id,
        origin: new URL(before).origin,
        status: "attempted",
        at: Date.now(),
      });
      await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", {
        nodeId,
        files: [doc.path],
      });
      return {
        status: "completed",
        summary:
          "Document selected in the portal. Inspect the page to verify upload completion before submitting.",
      };
    } finally {
      if (attached && !win.isDestroyed()) win.webContents.debugger.detach();
      busy.delete(companyId);
    }
  }
  async function fillForm(companyId, input = {}) {
    const win = current(companyId);
    if (busy.has(companyId)) throw new Error("Another browser action is pending.");
    if (typeof input.snapshotId !== 'string' || !Array.isArray(input.fields) || !input.fields.length || input.fields.length > 50) throw new Error('Inspect the form and provide 1–50 observed fields.');
    const ids = new Set();
    const fields = input.fields.map(f => {
      if (!Number.isSafeInteger(f.elementId) || f.elementId < 0 || ids.has(f.elementId) || typeof f.value !== 'string' || f.value.length > 12000) throw new Error('Invalid or duplicate form field.');
      ids.add(f.elementId); return {elementId:f.elementId,value:f.value};
    });
    busy.add(companyId);
    try {
      const before = win.webContents.getURL();
      await confirm(win, 'Fill these form fields?', new URL(before).origin + '\n' + fields.map(f => `Field ${f.elementId}: ${f.value}`).join('\n') + '\nFilling may send data to this portal. Submission is a separate action.');
      if (before !== win.webContents.getURL()) throw new Error('Page changed. Inspect again.');
      const event = record(companyId, 'browser_event', {operation:'fillForm',origin:new URL(before).origin,status:'attempted',at:Date.now()});
      try {
        await win.webContents.executeJavaScriptInIsolatedWorld(999, [{code:`(() => {
          const p=${JSON.stringify({snapshotId:input.snapshotId,fields})};
          if(globalThis.bonzaiSnapshot!==p.snapshotId) throw new Error('Stale form. Inspect again.');
          const targets=p.fields.map(f=>{
            const e=globalThis.bonzaiElements?.[f.elementId];
            if(!e?.isConnected || !e.getClientRects().length || e.disabled || e.readOnly || !['INPUT','TEXTAREA','SELECT'].includes(e.tagName) || ['password','file','hidden','checkbox','radio','submit','button'].includes(e.type) || e.autocomplete==='one-time-code') throw new Error('Unsupported or stale field.');
            if(e.tagName==='SELECT' && ![...e.options].some(o=>o.value===f.value)) throw new Error('Unobserved option.');
            return {e,value:f.value};
          });
          globalThis.bonzaiSnapshot=null;
          for(const {e,value} of targets){
            if(!e.isConnected) throw new Error('Form changed during filling. Inspect before retry.');
            const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);
            e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));
          }
        })()`}],true);
        record(companyId,'browser_event',{operation:'fillForm',origin:new URL(before).origin,status:'filled',at:Date.now()},event.id);
        return {status:'filled',summary:'Fields entered. Inspect the portal before submitting.'};
      } catch(error) {
        record(companyId,'browser_event',{operation:'fillForm',origin:new URL(before).origin,status:'uncertain',at:Date.now()},event.id);
        throw error;
      }
    } finally {busy.delete(companyId);}
  }
  async function close(companyId) {
    current(companyId).close();
    return { status: "closed" };
  }
  return { navigate, inspect, interact, fillForm, uploadDocument, close };
}
