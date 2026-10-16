// Upstream renamed the RPC executable; BonzAI's runtime path remains rpc-server.
export function rpcBuildTarget(cmake) {
  for (const target of ['ggml-rpc-server', 'rpc-server']) {
    const declaration = new RegExp(`set\\(\\s*TARGET\\s+"?${target}"?\\s*\\)`, 'i');
    if (declaration.test(cmake)) return target;
  }
  throw new Error('Unrecognized llama.cpp RPC target in tools/rpc/CMakeLists.txt');
}

export function selectGpuBackend(requested, available) {
  const backends = ['cuda', 'hip', 'vulkan'];
  if (requested && requested !== 'auto') {
    if (!backends.includes(requested)) throw new Error(`Unsupported llama.cpp backend: ${requested}`);
    if (!available(requested)) throw new Error(`Requested llama.cpp ${requested} toolchain is unavailable`);
    return requested;
  }
  return backends.find(available) || 'cpu';
}
