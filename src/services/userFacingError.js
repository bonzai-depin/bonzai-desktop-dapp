/** Remove Electron transport wrappers before presenting an actionable message. */
export function userFacingError(error, fallback = 'Generation could not finish. Please try again.') {
  let message = typeof error === 'string' ? error : error?.message;
  if (!message) return fallback;
  message = message.replace(/^(?:Error:\s*)?Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim();
  if (/OpenRouter spending limit or credits/.test(message)) return 'Your OpenRouter spending limit or credits have been reached.';
  if (/^(?:TypeError|ReferenceError|SyntaxError):|\bat (?:async )?\w+.*:\d+|ECONN|stack trace/i.test(message)) return fallback;
  return message;
}
