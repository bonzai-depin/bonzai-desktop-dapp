// One sequence per process, initialized randomly. Reused prompts and drafts
// never carry a fixed seed into a new inference request.
let sequence = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
export function freshGenerationSeed() {
  sequence = (sequence + 1) % 0x80000000;
  return sequence;
}
