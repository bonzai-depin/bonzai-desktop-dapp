export const teamMemoryId = (companyId, roleKey = null) =>
  `company-${companyId}${roleKey ? `:role-${roleKey}` : ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Structured tool receipts can contain credentials or raw inference traces.
// Neither belongs in business recall, even though the receipts remain local.
const privateKey = /^(?:secret.*|.*token|api_?key|access_?key|private_?key|password|credentials|authorization|cookie|mnemonic|reasoning(?:_content)?|thinking|llm|instructions|system_?prompt|request_?headers|headers|.*base64|.*dataurl|embedding)$/i;
export function businessEvidence(value, cleanText) {
  if (typeof value === 'string') {
    try { if (/^[\[{]/.test(value.trim())) return businessEvidence(JSON.parse(value), cleanText); } catch {}
    if (/^data:.*;base64,/i.test(value)) return '[media stored locally]';
    return cleanText(value).replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
      .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|hf_[a-zA-Z0-9]{12,})\b/g, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(item => businessEvidence(item, cleanText));
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return '[binary content stored locally]';
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKey.test(key))
    .map(([key, item]) => [key, businessEvidence(item, cleanText)]));
  return value;
}
