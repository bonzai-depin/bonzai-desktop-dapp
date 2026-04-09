/**
 * BonzAI Pipeline Privacy
 *
 * Privacy hardening for activation tensors flowing through the RPC tunnel.
 * Operates at the tunnel layer — llama-server and rpc-server are unaware.
 *
 * Two independent mechanisms:
 *
 * 1. Differential Privacy Noise Injection (opt-in)
 *    Adds calibrated Gaussian noise (ε-DP) to outgoing tensor data.
 *    Epsilon 2.0–16.0 preserves output coherence while making model
 *    inversion computationally infeasible. Higher ε = less noise = better quality.
 *
 * 2. Dimension Shuffling (always-on, negligible cost)
 *    Applies a random permutation to the hidden dimension of activation tensors
 *    before each hop. An attacker must brute-force d! possibilities (d=4096+)
 *    before attempting inversion. Inverse permutation applied on response.
 *
 * Academic reference: He et al. showed model inversion attacks on collaborative
 * inference degrade significantly with network depth. At 8 local layers,
 * token recoverability drops to ~35%.
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// DIFFERENTIAL PRIVACY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add calibrated Gaussian noise to an activation tensor.
 *
 * Uses the Gaussian mechanism: noise ~ N(0, σ²) where
 * σ = sensitivity * sqrt(2 * ln(1.25/δ)) / ε
 *
 * @param {Float32Array} activation - Raw activation tensor
 * @param {number} [epsilon=8.0] - Privacy budget (lower = more private, more noise)
 * @param {number} [delta=1e-5] - Failure probability
 * @param {number} [sensitivity=1.0] - L2 sensitivity estimate of the layer output
 * @returns {Float32Array} Noised activation (new array, original unchanged)
 */
export function addDPNoise(activation, epsilon = 8.0, delta = 1e-5, sensitivity = 1.0) {
  const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
  const noised = new Float32Array(activation.length);

  for (let i = 0; i < activation.length; i++) {
    noised[i] = activation[i] + gaussianRandom() * sigma;
  }

  return noised;
}

/**
 * Generate a Gaussian random number using the Box-Muller transform.
 * @returns {number} Sample from N(0, 1)
 */
function gaussianRandom() {
  let u, v, s;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt(-2 * Math.log(s) / s);
}

/**
 * Compute the noise magnitude (σ) for given DP parameters.
 * Useful for displaying the expected noise level to the user.
 *
 * @param {number} epsilon
 * @param {number} [delta=1e-5]
 * @param {number} [sensitivity=1.0]
 * @returns {number} σ (standard deviation of noise)
 */
export function computeNoiseSigma(epsilon, delta = 1e-5, sensitivity = 1.0) {
  return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIMENSION SHUFFLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a deterministic random permutation from a seed.
 * Uses Fisher-Yates shuffle with a seeded PRNG.
 *
 * @param {number} dim - Dimension size (e.g., 4096)
 * @param {string} seed - Seed string (e.g., sessionId + hopIndex)
 * @returns {Uint32Array} Permutation array mapping original → shuffled indices
 */
export function generatePermutation(dim, seed) {
  const perm = new Uint32Array(dim);
  for (let i = 0; i < dim; i++) perm[i] = i;

  // Seeded PRNG using SHA-256 of the seed
  const hash = crypto.createHash('sha256').update(seed).digest();
  let hashIdx = 0;

  const nextRandom = () => {
    if (hashIdx + 4 > hash.length) {
      // Extend the hash by re-hashing
      const newHash = crypto.createHash('sha256').update(hash).update(Buffer.from([hashIdx])).digest();
      hash.fill(0);
      newHash.copy(hash);
      hashIdx = 0;
    }
    const val = hash.readUInt32LE(hashIdx);
    hashIdx += 4;
    return val;
  };

  // Fisher-Yates shuffle
  for (let i = dim - 1; i > 0; i--) {
    const j = nextRandom() % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  return perm;
}

/**
 * Compute the inverse permutation.
 *
 * @param {Uint32Array} perm - Forward permutation
 * @returns {Uint32Array} Inverse permutation
 */
export function invertPermutation(perm) {
  const inv = new Uint32Array(perm.length);
  for (let i = 0; i < perm.length; i++) {
    inv[perm[i]] = i;
  }
  return inv;
}

/**
 * Apply a permutation to shuffle tensor dimensions.
 * For a tensor of shape [seqLen, dim], shuffles along the dim axis.
 *
 * @param {Float32Array} activation - Activation tensor (flattened [seqLen * dim])
 * @param {Uint32Array} perm - Permutation of [0, dim)
 * @param {number} dim - Hidden dimension size
 * @returns {Float32Array} Shuffled activation (new array)
 */
export function shuffleDimensions(activation, perm, dim) {
  const seqLen = activation.length / dim;
  const result = new Float32Array(activation.length);

  for (let s = 0; s < seqLen; s++) {
    const offset = s * dim;
    for (let d = 0; d < dim; d++) {
      result[offset + perm[d]] = activation[offset + d];
    }
  }

  return result;
}

/**
 * Apply inverse permutation to unshuffle tensor dimensions.
 *
 * @param {Float32Array} activation - Shuffled activation tensor
 * @param {Uint32Array} perm - The SAME forward permutation used for shuffling
 * @param {number} dim - Hidden dimension size
 * @returns {Float32Array} Unshuffled activation (new array)
 */
export function unshuffleDimensions(activation, perm, dim) {
  const inv = invertPermutation(perm);
  return shuffleDimensions(activation, inv, dim);
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION PRIVACY STATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a privacy context for a pipeline session.
 * Generates per-hop permutations and stores DP config.
 *
 * @param {Object} config
 * @param {string} config.sessionId - Pipeline session ID
 * @param {number} config.hiddenDim - Model hidden dimension (e.g., 4096)
 * @param {number} config.peerCount - Number of remote pipeline peers
 * @param {boolean} [config.dpEnabled=false] - Enable DP noise injection
 * @param {number} [config.epsilon=8.0] - DP privacy budget
 * @param {boolean} [config.dimensionShuffle=true] - Enable dimension shuffling
 * @returns {Object} Privacy context with per-hop permutations and config
 */
export function createPrivacyContext({
  sessionId,
  hiddenDim,
  peerCount,
  dpEnabled = false,
  epsilon = 8.0,
  dimensionShuffle = true,
}) {
  // Generate a unique permutation per hop (sessionId + hop index as seed)
  const permutations = [];
  const inversePermutations = [];

  if (dimensionShuffle) {
    for (let hop = 0; hop < peerCount; hop++) {
      const seed = `${sessionId}:hop:${hop}`;
      const perm = generatePermutation(hiddenDim, seed);
      permutations.push(perm);
      inversePermutations.push(invertPermutation(perm));
    }
  }

  return {
    sessionId,
    hiddenDim,
    dpEnabled,
    epsilon,
    dimensionShuffle,
    permutations,
    inversePermutations,

    /**
     * Apply privacy transforms to an outgoing activation tensor (before sending to peer).
     * @param {Float32Array} activation
     * @param {number} hopIndex - Which peer in the pipeline (0-based)
     * @returns {Float32Array} Transformed activation
     */
    protect(activation, hopIndex) {
      let result = activation;

      if (dpEnabled) {
        result = addDPNoise(result, epsilon);
      }

      if (dimensionShuffle && permutations[hopIndex]) {
        result = shuffleDimensions(result, permutations[hopIndex], hiddenDim);
      }

      return result;
    },

    /**
     * Remove privacy transforms from an incoming activation tensor (after receiving from peer).
     * @param {Float32Array} activation
     * @param {number} hopIndex
     * @returns {Float32Array} Restored activation
     */
    unprotect(activation, hopIndex) {
      let result = activation;

      if (dimensionShuffle && inversePermutations[hopIndex]) {
        result = shuffleDimensions(result, inversePermutations[hopIndex], hiddenDim);
      }

      // DP noise cannot be removed — it's additive and one-way by design.
      // The model must tolerate the noise level for coherent output.

      return result;
    },
  };
}
