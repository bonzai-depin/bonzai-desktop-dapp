// A successful add-chain request does not guarantee the wallet selected it.
export async function ensureWalletChain(provider, network) {
  const switchRequest = { method: 'wallet_switchEthereumChain', params: [{ chainId: network.chainIdHex }] };
  if (Number(await provider.request({ method: 'eth_chainId' })) === network.chainId) return;
  try {
    await provider.request(switchRequest);
  } catch (error) {
    if (Number(error.code) !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: network.chainIdHex, chainName: network.name, nativeCurrency: network.currency, rpcUrls: [network.rpc], blockExplorerUrls: [network.explorer] }],
    });
    await provider.request(switchRequest);
  }
  const actualChain = Number(await provider.request({ method: 'eth_chainId' }));
  if (actualChain !== network.chainId) throw new Error(`Wallet is on chain ${actualChain}; select ${network.name} (${network.chainId}) before continuing.`);
}
