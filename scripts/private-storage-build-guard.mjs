/** Vite can inline the entire env object, even without a direct secret reference. */
export function privateStorageBuildGuard() {
  return {
    name: 'bonzai-private-storage-credentials',
    configResolved(config) {
      if (Object.keys(config.env || {}).some(key => key.startsWith('VITE_PINATA_') && config.env[key])) {
        throw new Error('Remove legacy VITE_PINATA_* credentials from build environment files. Configure private storage in Ownership → Web3 Guide instead.');
      }
    },
  };
}
