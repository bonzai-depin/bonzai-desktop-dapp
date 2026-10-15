/** Bound a read-only UI request without leaving its timeout alive after completion.
 * The underlying request is not cancelled; callers must avoid side effects after it resolves.
 */
export async function withTimeout(request, milliseconds, message = "The request timed out. Please retry.") {
  let timer;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}
