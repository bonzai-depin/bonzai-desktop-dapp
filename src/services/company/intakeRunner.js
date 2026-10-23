import { agentModelOverride } from './teamCapabilities.js';
import { smartAgentCatalog } from '../smartAgentCatalog.js';
import { intakePrompt } from "../../shared/companyIntake.js";
import { syncIntakeMailboxes } from "./mailIntake.js";
import { extractIntakeFile } from "./intakeFiles.js";
import { tableIntakeActions } from "../../shared/intakeTables.js";
/** Runs inside the existing supervised team lease, never in a view lifecycle. */
export async function processIntake(
  charter,
  run,
  complete,
  api = globalThis.window?.electronAPI?.db?.companyIntake,
) {
  if (!api || charter.demoMode) return { processed: 0 };
  await syncIntakeMailboxes(charter.id, () => run.check());
  const job = await api.claim(charter.id);
  if (!job) return { processed: 0 };
  let interrupted = "";
  const renewTimer = setInterval(async () => {
    try {
      const ready = await run.check();
      if (!ready.ok) throw new Error(ready.reason);
      await api.renew(charter.id, { id: job.id, lease: job.lease });
    } catch (e) {
      interrupted = e.message;
      clearInterval(renewTimer);
    }
  }, 60000);
  try {
    const ready = await run.check();
    if (!ready.ok) throw new Error(ready.reason);
    if (!job.extracted) {
      const bytes = await window.electronAPI.db.blobs.read(job.blobId, job.ext);
      const chunks = await extractIntakeFile(
        new File([bytes], job.name, {
          type:
            {
              pdf: "application/pdf",
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              txt: "text/plain",
              md: "text/plain",
            }[job.ext] || "",
        }),
        { cachedPages:job.pages || [], onPage: api.checkpoint ? page=>api.checkpoint(charter.id,{id:job.id,lease:job.lease,page}) : undefined },
      );
      const current = await run.check();
      if (!current.ok) throw new Error(current.reason);
      await api.extracted(charter.id, { id: job.id, lease: job.lease, chunks });
      return { processed: 1, status: "queued" };
    }
    const mapped = tableIntakeActions(job.tableChunk || job.chunk);
    const json = mapped
      ? { actions: mapped }
      : (
          await complete(intakePrompt(job, job.context), {
            temperature: 0,
            maxTokens: 7000,
            timeoutMs: 30 * 60000,
            enableThinking: false,
            llmModel:
              agentModelOverride(charter, charter.roles?.DocumentController ? 'DocumentController' : 'CEO', smartAgentCatalog.agents),
            executionMode: charter.execution,
            streamContext: {
              companyId: charter.id,
              role: charter.roles?.DocumentController
                ? "DocumentController"
                : "CEO",
              action: "intake.analyze",
            },
          })
        ).json;
    if (interrupted) throw new Error(interrupted);
    const current = await run.check();
    if (!current.ok) throw new Error(current.reason);
    const result = await api.finish(charter.id, {
      id: job.id,
      lease: job.lease,
      actions: json.actions,
    });
    return { processed: 1, status: result.status };
  } catch (error) {
    try {
      await api.fail(charter.id, {
        id: job.id,
        lease: job.lease,
        error: error.message,
      });
    } catch {}
    return { processed: 0, error: error.message };
  } finally {
    clearInterval(renewTimer);
  }
}
