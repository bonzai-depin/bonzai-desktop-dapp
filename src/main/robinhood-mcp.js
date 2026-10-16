import http from "node:http";
import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = new URL("https://agent.robinhood.com/mcp/trading");
const STORE_KEY = "robinhood-mcp";
const MUTATION_PATTERN = /\b(place|submit|execute|cancel|replace|modify|update|create|delete|buy|sell|order)\b/i;
const REVIEW_PATTERN = /\b(review|preview|simulate|quote|validate)\b/i;

export const classifyRobinhoodTool = (name = "") => {
  const normalized = String(name).replace(/[_./:-]+/g, " ");
  if (REVIEW_PATTERN.test(normalized)) return "review";
  if (MUTATION_PATTERN.test(normalized)) return "mutation";
  return "read";
};

export class RobinhoodMcpManager {
  constructor({ store, safeStorage, shell, onState }) {
    this.store = store;
    this.safeStorage = safeStorage;
    this.shell = shell;
    this.onState = onState;
    this.client = null;
    this.transport = null;
    this.callbackServer = null;
    this.state = { status: "disconnected", tools: [], error: null };
  }

  emit(patch) {
    Object.assign(this.state, patch);
    this.onState?.(this.publicState());
  }

  publicState() {
    return {
      ...this.state,
      tools: this.state.tools.map(({ name, description, classification }) => ({ name, description, classification })),
    };
  }

  readVault() {
    const encrypted = this.store.get(STORE_KEY, null);
    if (!encrypted) return {};
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
    return JSON.parse(this.safeStorage.decryptString(Buffer.from(encrypted, "base64")));
  }

  writeVault(value) {
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
    this.store.set(STORE_KEY, this.safeStorage.encryptString(JSON.stringify(value)).toString("base64"));
  }

  async updateVault(patch) {
    this.writeVault({ ...this.readVault(), ...patch });
  }

  async createCallbackServer() {
    if (this.callbackServer) return this.callbackServer.redirectUrl;
    const callbackPath = `/oauth/${crypto.randomBytes(18).toString("hex")}`;
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== callbackPath) return res.writeHead(404).end();
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error || !code) {
        this.emit({ status: "error", error: error || "Robinhood authorization returned no code" });
        res.writeHead(400, { "Content-Type": "text/plain" }).end("BonzAI could not connect to Robinhood. You can close this window.");
        return;
      }
      try {
        await this.transport.finishAuth(code);
        await this.openSession();
        res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>BonzAI connected</title><body style='font:16px system-ui;padding:48px;background:#0a0a0f;color:#f0f0f5'><h1>Robinhood connected</h1><p>Return to BonzAI Desktop.</p></body>");
      } catch (cause) {
        this.emit({ status: "error", error: cause.message });
        res.writeHead(500, { "Content-Type": "text/plain" }).end("BonzAI could not finish Robinhood authorization.");
      } finally {
        setTimeout(() => this.closeCallbackServer(), 1000);
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    this.callbackServer = { server, redirectUrl: `http://127.0.0.1:${port}${callbackPath}` };
    return this.callbackServer.redirectUrl;
  }

  closeCallbackServer() {
    this.callbackServer?.server.close();
    this.callbackServer = null;
  }

  async connect() {
    const redirectUrl = await this.createCallbackServer();
    const provider = {
      redirectUrl,
      clientMetadata: {
        client_name: "BonzAI Desktop",
        client_uri: "https://bonzai.sh",
        redirect_uris: [redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      clientInformation: () => this.readVault().clientInformation,
      saveClientInformation: (clientInformation) => this.updateVault({ clientInformation }),
      tokens: () => this.readVault().tokens,
      saveTokens: (tokens) => this.updateVault({ tokens }),
      redirectToAuthorization: async (url) => {
        this.emit({ status: "authorizing", error: null });
        await this.shell.openExternal(url.toString());
      },
      saveCodeVerifier: (codeVerifier) => this.updateVault({ codeVerifier }),
      codeVerifier: () => this.readVault().codeVerifier,
    };
    this.transport = new StreamableHTTPClientTransport(MCP_URL, { authProvider: provider });
    this.client = new Client({ name: "bonzai-desktop", version: "1.0.0" });
    this.emit({ status: "connecting", error: null });
    try {
      await this.openSession();
    } catch (cause) {
      if (this.state.status !== "authorizing") this.emit({ status: "error", error: cause.message });
    }
    return this.publicState();
  }

  async openSession() {
    await this.client.connect(this.transport);
    const result = await this.client.listTools();
    const tools = (result.tools || []).map((tool) => ({ ...tool, classification: classifyRobinhoodTool(tool.name) }));
    this.emit({ status: "connected", tools, error: null });
  }

  async callTool({ name, arguments: args = {}, approved = false }) {
    const tool = this.state.tools.find((entry) => entry.name === name);
    if (!tool) throw new Error("Robinhood tool is unavailable or its schema changed");
    if (tool.classification === "mutation" && !approved) {
      throw new Error("A fresh confirmation is required for this Robinhood action");
    }
    return this.client.callTool({ name, arguments: args });
  }

  async stop() {
    // App shutdown closes transports without forgetting the saved connection.
    this.closeCallbackServer();
    try { await this.transport?.close(); } catch {}
    this.client = null;
    this.transport = null;
  }

  async disconnect() {
    try { await this.transport?.terminateSession(); } catch {}
    try { await this.transport?.close(); } catch {}
    this.closeCallbackServer();
    this.store.delete(STORE_KEY);
    this.client = null;
    this.transport = null;
    this.emit({ status: "disconnected", tools: [], error: null });
    return this.publicState();
  }
}
