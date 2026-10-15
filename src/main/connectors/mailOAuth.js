/** Optional offline OAuth credentials; no hosted account or new dependency. */
export async function refreshMailToken(kind, credential, fetcher = fetch) {
  if (!credential.refreshToken || !credential.clientId)
    throw new Error(
      "Reconnect the mailbox or provide offline OAuth credentials.",
    );
  const tenant = String(credential.tenant || "common");
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant))
    throw new Error("Invalid Microsoft tenant.");
  if (!["gmail", "outlook_mail", "google_calendar"].includes(kind))
    throw new Error("Unsupported mailbox.");
  const url =
    kind !== "outlook_mail"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credential.refreshToken,
    client_id: credential.clientId,
  });
  if (credential.clientSecret)
    body.set("client_secret", credential.clientSecret);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token)
    throw new Error(
      `Mailbox authorization expired (HTTP ${response.status}). Reconnect in Tools.`,
    );
  return {
    ...credential,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || credential.refreshToken,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in) || 3600) * 1000,
  };
}
