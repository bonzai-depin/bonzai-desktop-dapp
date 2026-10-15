import { randomBytes, createHash } from "node:crypto";
import { createServer } from "node:http";

export function mailAuthorizationConfig(kind, tenant = "common") {
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant))
    throw new Error("Invalid Microsoft tenant.");
  if (kind === "gmail")
    return {
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    };
  if (kind === "google_calendar")
    return {
      authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    };
  if (kind === "outlook_mail")
    return {
      authorize: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      scope:
        "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read",
    };
  throw new Error("Unsupported sign-in provider.");
}
/** System-browser PKCE, ephemeral loopback listener, no credentials in renderer. */
export async function authorizeMailbox({
  kind,
  clientId,
  clientSecret = "",
  tenant = "common",
  openExternal,
  fetcher = fetch,
  signal,
}) {
  if (!String(clientId || "").trim())
    throw new Error("Configure a desktop OAuth client ID first.");
  const config = mailAuthorizationConfig(kind, tenant),
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let redirect,
    settle,
    settled = false,
    exchanging = false,
    timeout;
  const result = new Promise((resolve, reject) => {
    settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      server.close();
      error ? reject(error) : resolve(value);
    };
  });
  // Attach a handler before opening the browser so aborts cannot be unhandled.
  result.catch(() => {});
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    if (
      req.method !== "GET" ||
      url.pathname !== "/callback" ||
      url.searchParams.get("state") !== state
    ) {
      res.writeHead(400);
      res.end("Invalid authorization response.");
      return;
    }
    if (settled || exchanging) {
      res.writeHead(409);
      res.end("Authorization already completed.");
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.end("Connection cancelled. Return to BonzAI.");
      settle(new Error("Provider authorization cancelled."));
      return;
    }
    // Consume the callback before exchanging; a duplicate cannot exchange twice.
    exchanging = true;
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        code,
        redirect_uri: redirect,
        grant_type: "authorization_code",
        code_verifier: verifier,
      });
      if (clientSecret) body.set("client_secret", clientSecret);
      const response = await fetcher(config.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token || !data.refresh_token)
        throw new Error(
          "Provider authorization failed. Check the application configuration and allow offline access.",
        );
      if (data.scope) {
        const normalized = scope => scope.replace('https://graph.microsoft.com/', '').toLowerCase();
        const granted = new Set(data.scope.split(' ').map(normalized));
        if (config.scope.split(' ').filter(scope => scope !== 'offline_access').some(scope => !granted.has(normalized(scope))))
          throw new Error('Required permissions were not granted. Reconnect and approve the requested access.');
      }
      const accountResponse = await fetcher(
        kind === "gmail"
          ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
          : kind === "google_calendar"
          ? "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250"
          : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
        {
          headers: { Authorization: `Bearer ${data.access_token}` },
          redirect: "error",
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        },
      );
      if (!accountResponse.ok)
        throw new Error("The account permissions could not be verified.");
      const account = await accountResponse.json();
      const accountName = account.emailAddress || account.mail || account.userPrincipalName || account.items?.find(item => item.primary)?.id;
      if (!accountName) throw new Error('The connected account could not be identified.');
      if (kind === "outlook_mail") {
        const permission = await fetcher(
          "https://graph.microsoft.com/v1.0/me/messages?$top=1&$select=id",
          {
            headers: { Authorization: `Bearer ${data.access_token}` },
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
          },
        );
        if (!permission.ok)
          throw new Error("Read-only mailbox permission is required.");
      }
      if (settled) {
        res.end("Connection cancelled. Return to BonzAI.");
        return;
      }
      res.end("Account connected. Return to BonzAI.");
      settle(null, {
        credential: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          clientId,
          clientSecret,
          tenant,
          expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        },
        account: accountName,
        scopes: String(data.scope || config.scope).split(" "),
      });
    } catch (error) {
      res.end("Connection failed. Return to BonzAI.");
      settle(error);
    }
  });
  function cancel() {
    settle(new Error("Provider authorization cancelled."));
  }
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    // Microsoft ignores ephemeral ports for registered localhost callbacks.
    // The listener itself remains bound exclusively to the loopback interface.
    redirect = `http://${kind === 'outlook_mail' ? 'localhost' : '127.0.0.1'}:${server.address().port}/callback`;
    if (signal?.aborted) {
      cancel();
      return result;
    }
    signal?.addEventListener("abort", cancel, { once: true });
    timeout = setTimeout(
      () => {
        settle(new Error("Provider authorization timed out. Try signing in again."));
      },
      5 * 60 * 1000,
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: config.scope,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...(kind !== "outlook_mail"
        ? { access_type: "offline", prompt: "consent select_account" }
        : { prompt: "select_account" }),
    });
    await openExternal(config.authorize + "?" + params);
  } catch (error) {
    settle(error);
  }
  return result;
}
