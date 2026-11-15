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

// Portable Linux release layout (used by the ARM64 CUDA installer): GPU and
// CPU backends are plugins beside the executables, so a machine without the
// CUDA runtime still starts on CPU, and one binary set covers ARMv8.0–ARMv9.2
// instead of the build host's CPU. Mirrors upstream llama.cpp release builds.
export function portableLinuxFlags(platform, portable) {
  if (platform !== 'linux' || !portable) return [];
  return [
    '-DGGML_BACKEND_DL=ON',
    '-DGGML_NATIVE=OFF',
    '-DGGML_CPU_ALL_VARIANTS=ON',
    '-DCMAKE_INSTALL_RPATH=$ORIGIN',
    '-DCMAKE_BUILD_WITH_INSTALL_RPATH=ON',
  ];
}

// Map CMake's versioned library chain (libx.so -> libx.so.0 -> libx.so.0.1.2)
// to the single file name each consumer opens. Packaging dereferences
// symlinks, so shipping the whole chain would triple every library.
//   - backend plugins are discovered by scanning for libggml-<name>.so
//   - linked libraries are resolved by SONAME (libx.so.<major>)
export function portableLibraryNames(names) {
  const groups = new Map();
  for (const name of names) {
    const match = /^(lib.+\.so)((?:\.\d+)*)$/.exec(name);
    if (!match) continue;
    if (!groups.has(match[1])) groups.set(match[1], []);
    groups.get(match[1]).push(name);
  }
  const result = [];
  for (const [base, chain] of groups) {
    const plugin = /^libggml-(?!base\.so$)/.test(base);
    const soname = chain.find(name => /\.so\.\d+$/.test(name));
    result.push({ source: chain.includes(base) ? base : chain[0], name: plugin || !soname ? base : soname });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function assertLinuxPortableFiles(files, backend = 'cuda') {
  const names = new Set(files);
  const required = ['llama-server', 'rpc-server', 'llama-quantize', 'libggml-rpc.so'];
  if (backend !== 'cpu') required.push(`libggml-${backend}.so`);
  for (const name of required) {
    if (!names.has(name)) throw new Error(`Incomplete Linux runtime: missing ${name}`);
  }
  for (const prefix of ['libllama.so', 'libggml.so', 'libggml-base.so']) {
    if (!files.some(name => name === prefix || name.startsWith(`${prefix}.`))) {
      throw new Error(`Incomplete Linux runtime: missing ${prefix}`);
    }
  }
  // Without a CPU plugin the runtime cannot start when the GPU is unavailable.
  if (!files.some(name => /^libggml-cpu(-.+)?\.so$/.test(name))) {
    throw new Error('Incomplete Linux runtime: missing CPU backend');
  }
}
