/** Remove Electron transport wrappers before presenting an actionable message. */
export function userFacingError(error, fallback = 'Generation could not finish. Please try again.') {
  let message = typeof error === 'string' ? error : error?.message;
  if (!message) return fallback;
  message = message.replace(/^(?:Error:\s*)?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim();
  if (/OpenRouter spending limit or credits/.test(message)) return 'Your OpenRouter spending limit or credits have been reached.';
  if (/MiniMax H3 numerical failure|non.finite|NaN.*(?:tensor|latent)/i.test(message)) return 'The video could not be generated reliably. Please try again with a different seed or a shorter clip.';
  if (/Cross-platform vision assets are not downloaded/i.test(message)) return 'Download the vision model before creating a prompt from an image.';
  if (/torch\.|transformer_blocks|Traceback|CUDA|MPS backend|safetensors|HF_TOKEN/i.test(message)) return fallback;
  if (/^(?:TypeError|ReferenceError|SyntaxError):|\bat (?:async )?\w+.*:\d+|ECONN|stack trace/i.test(message)) return fallback;
  return message;
}
