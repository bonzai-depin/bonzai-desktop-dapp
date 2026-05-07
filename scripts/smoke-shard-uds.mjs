#!/usr/bin/env node
/**
 * Wire-format smoke test for the privacy-pipeline UDS bridge.
 *
 * Runs the Node-side framing in isolation (no libp2p), accepts one UDS
 * connection, parrots the OPEN_OK control message back, and round-trips
 * any data frames it receives. Pair with `bonzai/bin/python3 -c …` (see
 * REPRO at the bottom of this file) to assert that the JS encoder and
 * Python decoder agree byte-for-byte on the wire.
 *
 * Run: `node scripts/smoke-shard-uds.mjs &` then the Python repro one-liner.
 */

import { createServer } from 'node:net';
import { unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encodeShardFrame,
  decodeShardFrame,
  ShardFrameType,
  ShardFrameFlag,
  ShardDtype,
  SHARD_FRAME_VERSION,
} from '../src/services/pipeline.protocol.js';
import { __test } from '../src/main/shardSession.js';

const { encodeControl, encodeUdsMessage, createUdsSplitter, UDS_TYPE_FRAME } = __test;

const SOCK = process.env.BONZAI_SHARD_SOCKET
  || join(tmpdir(), `bonzai-shard-${process.pid}.sock`);

if (existsSync(SOCK)) {
  try { unlinkSync(SOCK); } catch {}
}

console.log(`[smoke] listening on ${SOCK}`);
console.log(`[smoke] BONZAI_SHARD_SOCKET=${SOCK} bonzai/bin/python3 - <<'PY'`);
console.log(`import os, torch, sys`);
console.log(`sys.path.insert(0, '${process.cwd()}')`);
console.log(`from src.server.pipeline_transport import open_session, encode_tensor_payload, decode_tensor_payload, FLAG_QUANTIZED_INT8, FLAG_COMPRESSED_LZ4`);
console.log(`# minimal echo demo`);
console.log(`os.environ['BONZAI_SHARD_SOCKET'] = '${SOCK}'`);
console.log(`s = open_session(peer_id='12D3stub', session_id='test-session-aaaa', model_id='z_image_turbo', block_range=(4, 28), hidden_dim=2304)`);
console.log(`x = torch.randn(1, 4096, 2304, dtype=torch.float16) * 0.1`);
console.log(`s.send_activation(x)`);
console.log(`y = s.recv_activation()`);
console.log(`print('round-trip ok:', y.shape, 'rmse', (y.float()-x.float()).pow(2).mean().sqrt().item())`);
console.log(`s.close()`);
console.log(`PY`);

const server = createServer((sock) => {
  console.log('[smoke] connection accepted');
  const splitter = createUdsSplitter((type, body) => {
    if (type === 0x01) {
      const msg = JSON.parse(body.toString('utf8'));
      console.log('[smoke] control:', msg.op, msg.modelId || '');
      if (msg.op === 'open') {
        sock.write(encodeControl('open_ok', {
          shardId: 'stub-' + msg.sessionId.slice(0, 8),
          codecFlags: msg.codecFlags ?? 0,
          frameVersion: SHARD_FRAME_VERSION,
        }));
      } else if (msg.op === 'close') {
        sock.end();
      }
    } else if (type === UDS_TYPE_FRAME) {
      // Parse the embedded shard frame, log it, then echo as ACT_RETURN.
      const decoded = decodeShardFrame(body);
      console.log(
        '[smoke] frame type=0x%s flags=0x%s shape=%j step=%d body=%dB',
        decoded.type.toString(16).padStart(2, '0'),
        decoded.flags.toString(16).padStart(2, '0'),
        decoded.meta.shape.slice(0, decoded.meta.rank),
        decoded.meta.step,
        decoded.payload.length,
      );
      // Echo: same payload + meta, but type = ACT_RETURN
      const echo = encodeShardFrame(
        ShardFrameType.ACT_RETURN,
        decoded.flags,
        decoded.meta,
        decoded.payload,
      );
      sock.write(encodeUdsMessage(UDS_TYPE_FRAME, echo));
    }
  });
  sock.on('data', (chunk) => splitter.push(chunk));
  sock.on('close', () => console.log('[smoke] connection closed'));
});

server.listen(SOCK, () => {
  console.log('[smoke] ready — run the Python one-liner above');
});

// Auto-exit after 60s for CI safety
setTimeout(() => {
  console.log('[smoke] timeout — exiting');
  server.close();
  if (existsSync(SOCK)) try { unlinkSync(SOCK); } catch {}
  process.exit(0);
}, 60000).unref();
