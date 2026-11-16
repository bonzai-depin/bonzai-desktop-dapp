# Linked devices and pooled inference

BonzAI Desktop finds other BonzAI computers on the local network and lets the user link their own devices so a model too large for one of them can run across several. This document covers the trust model, the protocols, and what has and has not been verified.

## Behaviour

| Step | What happens | What crosses the network |
| --- | --- | --- |
| Discovery | The libp2p node starts with the app (`p2p.discoveryEnabled`, default on) and announces itself over mDNS. | Peer ID and addresses. No profile, model list or content. |
| Linking | One device shows an 8-character code; the user types it on the other. | A two-message proof exchange. The host's name, platform and memory budget are sent only after the joiner proves the code. |
| Status | Linked devices exchange name, platform, GPU, memory budget and whether they currently lend. | Only between linked devices; everyone else receives `not_linked`. |
| Lending | A device with at least one link and lending enabled runs llama.cpp `rpc-server` on `127.0.0.1:50052`. | Nothing until a linked device opens a tunnel. |
| Pooling | When a model's estimated need exceeds the local memory budget, `loadModel` opens tunnels to the largest reachable lenders and starts `llama-server` with `--rpc`. | Model weights and layer activations, to the user's own linked devices only. |

Models that fit locally are never pooled: local execution is faster. If the pool cannot hold the model, or a chosen device is unreachable, no partial pool is used and the load proceeds as it did before this feature.

Linking is independent of Private / Consumer / Provider mode. Those modes still govern unlinked peers: a device in Private mode executes nothing for strangers.

## Trust model

- **Identity.** Each installation has an Ed25519 libp2p key, created on first start and stored with Electron `safeStorage` under `mesh-identity-secret`. Links are bound to the resulting peer ID. If the OS offers no secure storage the key is kept in memory only, the UI says so, and links last until restart.
- **Pairing.** The code has 40 bits of entropy, is single use, expires after 5 minutes and is closed after 5 failed proofs. Both sides derive a key with scrypt (N=2¹⁵) from the code and a salt that includes both peer IDs, as authenticated by Noise, and both nonces. The joiner proves first; the host answers with its own proof. A relay or impostor therefore cannot complete the exchange, and one captured proof cannot be brute-forced before the invitation expires.
- **Authorization.** Every inbound `/bonzai/v2/rpc-tunnel` stream is checked: the peer must be linked and lending must be on, or the device must be in Provider mode. `registerRPCTunnelHandler` refuses to register without an `authorize` function.
- **Transport.** `rpc-server` binds to loopback. Remote access exists only through the Noise-encrypted libp2p stream; there is no LAN-reachable RPC port.
- **Storage boundary.** `mesh-devices` and `mesh-identity-secret` are rejected by the generic preference IPC (`store-get` / `store-set`), so the renderer cannot add a link or read the key.
- **Unlinking** removes trust on both devices: the other side is told immediately, or learns on its next status request.

Pooling places layers on another machine, so that machine processes the conversation's activations. This is acceptable for the user's own devices and is why pooling never uses unlinked peers. Splitting work with untrusted providers remains the separate private pipeline (`pipeline.orchestrator.js`).

## Code map

| Path | Responsibility |
| --- | --- |
| `src/main/meshDevices.js` | Pairing protocol, linked-device store, sealed identity |
| `src/main/meshController.js` | Protocol handlers, lending, pool preparation and release |
| `src/services/meshPlan.js` | Pure planning: memory need, lendable memory, pool selection |
| `src/services/pipeline.tunnel.js` | TCP ↔ libp2p bridge, one stream per connection, authorization |
| `src/services/libp2p.service.js` | `MESH_PAIR` / `MESH_DEVICE` protocols, stored identity, JSON requests |
| `src/components/MeshDevices.vue` | Link, list, unlink, lend/borrow settings (welcome screen and mesh panel) |
| `src/services/modelRecommendation.js` | First-run recommendation with the pooled budget |

## Corrections made alongside

- The private pipeline's LAN path dialled `<lan-ip>:50052` directly, but `rpc-server` listens on loopback, and it included every discovered LAN peer. It now uses tunnels and only selected providers or linked devices.
- The tunnel reused one libp2p stream for every TCP connection. llama.cpp opens several connections in turn, so each now gets its own stream.
- `p2p.pipeline.localProportion` is stored as a percentage and was read as a fraction, producing an invalid tensor split. Both forms are accepted.

## Verification

```bash
npm run test:mesh
BONZAI_UI_URL=http://127.0.0.1:5178 node --test test/mesh-devices.browser.test.mjs
```

`test:mesh` covers pairing, relay and impostor rejection, attempt limits, expiry, the storage boundary, pool planning, and three real encrypted libp2p nodes on loopback: linking, status, multi-connection tunnel traffic, refusal of an unlinked peer, lending opt-out, and unlinking. Verified once by hand on macOS ARM64: the bundled `rpc-server` behind the tunnel and the bundled `llama-server` with `--rpc` loaded a 0.8B GGUF through it and completed a chat request.

Not yet verified:

- Two physical machines, mDNS discovery across real network hardware, and throughput over Wi-Fi versus Ethernet.
- Mixed backends (Metal lending to CUDA and the reverse), and MTP or draft-model speculative decoding combined with `--rpc`.
- Context sizing for pooled models: the context heuristic still uses the local memory budget, so pooled models start with a conservative context.
- Linux ARM64. No installer is built for that architecture, so a DGX Spark cannot join yet.
- Media pipelines. Pooling applies to GGUF language models only.
