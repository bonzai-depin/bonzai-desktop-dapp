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

// A cached CPU build must never satisfy a request for a GPU release build.
export function buildConfigurationMatches(marker, flags) {
  return Array.isArray(marker?.cmakeFlags) &&
    JSON.stringify(marker.cmakeFlags) === JSON.stringify(flags);
}

export function assertWindowsGpuFiles(files, backend = 'vulkan') {
  const names = new Set(files.map(name => name.toLowerCase()));
  for (const name of ['llama-server.exe', 'rpc-server.exe', 'llama-quantize.exe',
    'llama.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-rpc.dll', `ggml-${backend}.dll`]) {
    if (!names.has(name)) throw new Error(`Incomplete Windows GPU runtime: missing ${name}`);
  }
}
