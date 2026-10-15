# Smart-agent chat channels

Roleplay exposes local one-to-one sessions and public X sessions for the selected companion. Both use `services/chat/capabilities.js` to route creation requests and save deliverables, and `ChatWorkflowResult.vue` to play or download them. Local media commands are `/image`, `/audio`, `/music`, `/video`, `/3d`, and `/vision`. Vision requires an attached image; 3D returns the generated JavaScript as a downloadable project source.

`/workflow <catalog-id> <JSON inputs>` executes an assigned workflow. Natural English requests for media and guided meditation also route to execution. Meditation Forge and prompt-only workflows have headless delivery adapters. Other interactive workflows explicitly report that their workspace is required; opening a workspace is not a completed result. Existing workflow access checks still apply. Required models must already be installed; these requests do not start downloads.

## Public sessions

The renderer polls enabled sessions while BonzAI remains open and awake. SQLite migration `0017_public_agent_sessions.sql` stores the public account binding, cursor, pagination, inbox, results and opt-outs. Each X post ID is unique per agent. Cursors advance only after all pages have been persisted. Only direct mentions requesting a reply are queued; `stop`, `unsubscribe` and `opt out` mentions suppress further replies from that author.

The owner supplies an explicit public persona, enabled media/workflows, a daily generation limit and a publication mode. Review is the default. X credentials are encrypted with Electron safeStorage; X access tokens stay in main. A restricted v2 transport injects authentication and refreshes at most once per unauthorized request. One X account can bind to one active agent session in this implementation.

Public prompts contain only the public persona, incoming post and prior published exchanges with that author in that conversation. They never use roleplay profiles, local conversation history, company memory or credentials. Local creation calls use isolated model requests rather than the main chat history.

Images and video attach to the original mention. Voice, music and meditation audio are converted locally to MP4 with a generated cover (or a neutral backdrop), then uploaded through X v2 initialize/append/finalize. The local upload limit is 64 MB. No temporary local URL is presented as a publicly downloadable file. X does not deliver 3D project files or private image attachments through this adapter.

Publication needs an actual X post ID before the request becomes `posted`. A failed upload retains the saved result for review. An interrupted or ambiguous POST becomes `unknown` and cannot be automatically retried. Pause and opt-out are checked again after media preparation. Interrupted generation becomes a visible failure; it is not reported as completed.

## Deployment and validation

Use an X developer app with OAuth 2.0 PKCE, callback `bonzai://social/callback/x`, and tweet.read, tweet.write, users.read, offline.access and media.write scopes. X API plan access is required. [X's automation rules](https://help.x.com/en/rules-and-policies/x-automation) require written approval for AI reply bots, opt-in interactions and opt-out support; the owner must also label the automated account. Connecting an account alone does not enable listening or automatic publishing.

`node --test test/chat-capabilities.test.mjs test/public-sessions.test.mjs` exercises routing, failure propagation, credential migration, real SQLite persistence, mocked X upload/replies and actual ffmpeg audio conversion. `BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/public-session.browser.test.mjs` checks five themes, constrained widths and explicit publication controls with fixture accounts. These tests do not establish live X app access, actual model availability or production inference performance.
