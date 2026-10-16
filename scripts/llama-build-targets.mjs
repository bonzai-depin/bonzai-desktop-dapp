// Upstream renamed the RPC executable; BonzAI's runtime path remains rpc-server.
export function rpcBuildTarget(cmake) {
  for (const target of ['ggml-rpc-server', 'rpc-server']) {
    const declaration = new RegExp(`set\\(\\s*TARGET\\s+"?${target}"?\\s*\\)`, 'i');
    if (declaration.test(cmake)) return target;
  }
  throw new Error('Unrecognized llama.cpp RPC target in tools/rpc/CMakeLists.txt');
}
