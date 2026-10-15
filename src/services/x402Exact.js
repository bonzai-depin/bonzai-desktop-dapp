import { ethers } from 'ethers';

// Native x402 v2 exact/EIP-3009. Independent from the older BonzAI ETH-receipt protocol.
export const X402_AUTH_TYPES = { TransferWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] };
const ABI = ['function name() view returns(string)', 'function DOMAIN_SEPARATOR() view returns(bytes32)',
  'function authorizationState(address,bytes32) view returns(bool)', 'function balanceOf(address) view returns(uint256)',
  'function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)'];
export function exactRequirements({ chainId, asset, payTo, amount, name, maxTimeoutSeconds = 300 }) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !ethers.isAddress(asset) || asset === ethers.ZeroAddress
    || !ethers.isAddress(payTo) || payTo === ethers.ZeroAddress || !/^\d+$/.test(String(amount)) || BigInt(amount) <= 0n || !name
    || !Number.isInteger(maxTimeoutSeconds) || maxTimeoutSeconds < 1 || maxTimeoutSeconds > 3600) throw new Error('Invalid payment requirements.');
  return { scheme: 'exact', network: `eip155:${chainId}`, amount: String(amount), asset, payTo, maxTimeoutSeconds,
    extra: { assetTransferMethod: 'eip3009', name, version: '1' } };
}
const domain = requirement => ({ name: requirement.extra.name, version: requirement.extra.version,
  chainId: Number(requirement.network.split(':')[1]), verifyingContract: requirement.asset });
export async function signExactPayment(requirement, signer, { approved = false, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!approved) throw new Error('Approve the exact token, recipient and amount before signing payment.');
  exactRequirements({ chainId: domain(requirement).chainId, asset: requirement.asset, payTo: requirement.payTo, amount: requirement.amount, name: requirement.extra.name, maxTimeoutSeconds: requirement.maxTimeoutSeconds });
  if (requirement.scheme !== 'exact' || requirement.extra.assetTransferMethod !== 'eip3009' || requirement.extra.version !== '1') throw new Error('Unsupported x402 payment scheme.');
  if (!/^eip155:[1-9]\d*$/.test(requirement.network)) throw new Error('Invalid payment network.');
  const authorization = { from: await signer.getAddress(), to: requirement.payTo, value: requirement.amount,
    validAfter: String(now - 1), validBefore: String(now + requirement.maxTimeoutSeconds), nonce: ethers.hexlify(ethers.randomBytes(32)) };
  return { x402Version: 2, accepted: requirement, payload: { authorization, signature: await signer.signTypedData(domain(requirement), X402_AUTH_TYPES, authorization) } };
}
export async function verifyExactPayment(payment, expected, provider, now = null) {
  if (!/^eip155:[1-9]\d*$/.test(expected?.network || '')) throw new Error('Invalid payment network.');
  now ??= Number((await provider.getBlock('latest')).timestamp);
  if (payment?.x402Version !== 2 || expected?.scheme !== 'exact' || expected.extra?.assetTransferMethod !== 'eip3009') throw new Error('Unsupported x402 payment.');
  for (const key of ['scheme', 'network', 'asset', 'payTo', 'amount', 'maxTimeoutSeconds']) if (String(payment.accepted?.[key]).toLowerCase() !== String(expected[key]).toLowerCase()) throw new Error('Payment requirements changed.');
  for (const key of ['assetTransferMethod', 'name', 'version']) if (payment.accepted.extra?.[key] !== expected.extra[key]) throw new Error('Payment domain changed.');
  if (Number((await provider.getNetwork()).chainId) !== domain(expected).chainId) throw new Error('Payment network mismatch.');
  const { authorization: a, signature } = payment.payload || {};
  if (!a || a.to?.toLowerCase() !== expected.payTo.toLowerCase() || String(a.value) !== expected.amount
    || BigInt(a.validAfter) >= BigInt(now) || BigInt(a.validBefore) <= BigInt(now)
    || BigInt(a.validBefore) > BigInt(now + expected.maxTimeoutSeconds) || !ethers.isHexString(a.nonce, 32)) throw new Error('Invalid payment authorization.');
  if (ethers.verifyTypedData(domain(expected), X402_AUTH_TYPES, a, signature).toLowerCase() !== a.from.toLowerCase()) throw new Error('Invalid payer signature.');
  const token = new ethers.Contract(expected.asset, ABI, provider);
  if (await token.DOMAIN_SEPARATOR() !== ethers.TypedDataEncoder.hashDomain(domain(expected))) throw new Error('Token does not support the advertised EIP-3009 domain.');
  if (await token.authorizationState(a.from, a.nonce)) throw new Error('Payment authorization already used.');
  if (await token.balanceOf(a.from) < BigInt(a.value)) throw new Error('Insufficient token balance.');
  const sig = ethers.Signature.from(signature);
  const args = [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, sig.v, sig.r, sig.s];
  await token.transferWithAuthorization.staticCall(...args);
  return { args, payer: a.from };
}
export async function settleExactPayment(payment, expected, relayer, { approved = false } = {}) {
  if (!approved) throw new Error('Approve gas spending by the local payment relayer.');
  const verified = await verifyExactPayment(payment, expected, relayer.provider);
  const token = new ethers.Contract(expected.asset, ABI, relayer);
  const tx = await token.transferWithAuthorization(...verified.args);
  try {
    const receipt = await tx.wait();
    return { success: receipt?.status === 1, network: expected.network, transaction: tx.hash, payer: verified.payer };
  } catch (error) {
    return { success: false, errorReason: error.receipt?.status === 0 ? 'transaction_failed' : 'settlement_pending', network: expected.network, transaction: tx.hash, payer: verified.payer };
  }
}
