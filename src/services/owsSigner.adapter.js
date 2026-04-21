/**
 * OWS Ethers.js Signer Adapter
 *
 * Implements ethers.AbstractSigner backed by OWS IPC calls.
 * This allows transparent integration with all existing code that expects
 * ethers signers (x402, purchaseExecutor, skillOwnership, etc.).
 */

import { ethers } from 'ethers';
import { owsService } from './ows.service.js';

export class OWSEthersSigner extends ethers.AbstractSigner {
  /**
   * @param {string} walletName - OWS wallet name
   * @param {string} passphrase - Wallet passphrase or API key token
   * @param {ethers.Provider} [provider] - ethers provider
   */
  constructor(walletName, passphrase, provider) {
    super(provider);
    this._walletName = walletName;
    this._passphrase = passphrase;
    this._addressCache = null;
  }

  /**
   * Get the wallet address from OWS.
   * @returns {Promise<string>}
   */
  async getAddress() {
    if (this._addressCache) return this._addressCache;

    const result = await owsService.getWallet(this._walletName);
    if (result.error) {
      throw new Error(`OWS getAddress failed: ${result.error}`);
    }
    this._addressCache = result.address;
    return result.address;
  }

  /**
   * Sign a plain message.
   * @param {string|Uint8Array} message
   * @returns {Promise<string>} Signature hex
   */
  async signMessage(message) {
    const msgStr = typeof message === 'string'
      ? message
      : ethers.hexlify(message);

    const result = await owsService.signMessage(this._walletName, msgStr, this._passphrase);
    if (result.error) {
      throw new Error(`OWS signMessage failed: ${result.error}`);
    }
    return result.signature;
  }

  /**
   * Sign EIP-712 typed data.
   *
   * Converts ethers-style (domain, types, value) into OWS's single JSON envelope:
   * { types: { EIP712Domain: [...], ...types }, primaryType, domain, message: value }
   *
   * @param {ethers.TypedDataDomain} domain - EIP-712 domain (name, version, chainId, verifyingContract, salt)
   * @param {Record<string, Array<{name: string, type: string}>>} types - Type definitions (without EIP712Domain)
   * @param {Record<string, unknown>} value - Message values matching the primary type
   * @returns {Promise<string>} Signature hex
   */
  async signTypedData(domain, types, value) {
    // Build EIP712Domain type from domain fields
    const eip712DomainType = [];
    if (domain.name !== undefined) eip712DomainType.push({ name: 'name', type: 'string' });
    if (domain.version !== undefined) eip712DomainType.push({ name: 'version', type: 'string' });
    if (domain.chainId !== undefined) eip712DomainType.push({ name: 'chainId', type: 'uint256' });
    if (domain.verifyingContract !== undefined) eip712DomainType.push({ name: 'verifyingContract', type: 'address' });
    if (domain.salt !== undefined) eip712DomainType.push({ name: 'salt', type: 'bytes32' });

    // Determine primaryType (first key in types that isn't EIP712Domain)
    const primaryType = Object.keys(types).find(k => k !== 'EIP712Domain');
    if (!primaryType) {
      throw new Error('No primary type found in types object');
    }

    // Serialize BigInt values to strings for JSON
    const serializedDomain = serializeBigInts(domain);
    const serializedValue = serializeBigInts(value);

    const typedDataJson = JSON.stringify({
      types: {
        EIP712Domain: eip712DomainType,
        ...types,
      },
      primaryType,
      domain: serializedDomain,
      message: serializedValue,
    });

    const result = await owsService.signTypedData(this._walletName, typedDataJson, this._passphrase);
    if (result.error) {
      throw new Error(`OWS signTypedData failed: ${result.error}`);
    }
    return result.signature;
  }

  /**
   * Sign a transaction.
   * @param {ethers.TransactionRequest} tx - Transaction to sign
   * @returns {Promise<string>} Signed transaction hex
   */
  async signTransaction(tx) {
    // Populate missing fields
    const populated = await this.provider
      ? await ethers.resolveProperties(tx)
      : tx;

    // Serialize unsigned transaction
    const unsignedTx = ethers.Transaction.from(populated);
    const rawTxHex = unsignedTx.unsignedSerialized;

    const result = await owsService.signTransaction(this._walletName, rawTxHex, this._passphrase);
    if (result.error) {
      throw new Error(`OWS signTransaction failed: ${result.error}`);
    }
    return result.signedTx;
  }

  /**
   * Return a new signer connected to a different provider.
   * @param {ethers.Provider} provider
   * @returns {OWSEthersSigner}
   */
  connect(provider) {
    return new OWSEthersSigner(this._walletName, this._passphrase, provider);
  }
}

/**
 * Recursively convert BigInt values to strings for JSON serialization.
 * @param {bigint|string|number|boolean|null|undefined|Array|Record<string, unknown>} obj
 * @returns {string|number|boolean|null|undefined|Array|Record<string, unknown>}
 */
function serializeBigInts(obj) {
  if (typeof obj === 'bigint') return obj.toString();
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = serializeBigInts(val);
    }
    return result;
  }
  return obj;
}

export default OWSEthersSigner;
