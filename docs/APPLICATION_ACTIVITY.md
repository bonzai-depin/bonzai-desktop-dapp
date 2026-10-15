# Application activity

`ApplicationActivityBar.vue` is mounted in the application shell, outside workspace navigation. Its fixed-height row reserves space; its expandable panel overlays the workspace without resizing it.

Sources:
- `activityStore.js` listens to the shared generation socket, native download events and download snapshots. It keeps up to 30 terminal records in renderer memory. It also reads device-wide language-model telemetry, without treating model residency as work.
- Flask `GenerationTracker` preserves actual stage names and sends a prompt-free operational snapshot on connection and explicit `activity_snapshot`. Snapshots include active jobs and the last 30 outcomes; disappearance or disconnection never implies success.
- Text and 3D request handlers publish their outcomes explicitly with `reportOperation`.
- Team activity reads runtime health, active streams and pending approvals. Polling is independent of the selected team view.
- Roleplay reads the global autonomous session. Pause disables future autonomous turns without deleting the session or claiming the current turn is cancelled.
- Server lifecycle events and the `get-server-status` IPC snapshot expose startup and recovery before Python is ready.

A percentage is shown only when supplied by its source. Percentages refer to the current reported stage, not an estimated whole-job duration. Download completion requires an explicit outcome, not 100% received bytes. Raw native download fractions are converted to percentages once.

Navigation opens the owning feature or team; it does not cancel work. Retry is exposed only for the server's supported recovery action. Generation cancellation remains in its owning feature. No peer-request acceptance policy is changed: inbound inference approval is a later integration and must be backed by enforced gateway decisions, not UI-only buttons.

Validation:

```sh
node --test test/activity-operations.test.mjs
bonzai/bin/python test/test_activity_snapshot.py
BONZAI_UI_URL=http://localhost:5173 node --test test/application-activity.browser.test.mjs test/agent-navigation.browser.test.mjs
```

The browser fixture uses synthetic operations and does not execute workloads or access company records. Restart the desktop application to load the new server snapshot and native download outcome emitters.
