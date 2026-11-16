import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../src/config/web3.config.js";
const addr = (n) => "0x" + n.toString(16).padStart(40, "0");
const wallet = addr(1),
  usdc = addr(2),
  token = addr(3),
  quoter = addr(4),
  router = addr(5),
  permit2 = addr(6);
CONFIG.basketRewards.usdcAddress = usdc;
Object.assign(CONFIG.uniswap[ECONOMY_NETWORK_KEY], {
  quoter,
  universalRouter: router,
  permit2,
  routerAbiVersion: "v1",
});
CONFIG.smartAgentIssuance.factoryAddress = "";
const PATH =
  "tuple(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[]";
const iface = new ethers.Interface([
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  `function quoteExactOutput(tuple(address exactCurrency,${PATH} path,uint128 exactAmount)) returns(uint256 amountIn,uint256 gasEstimate)`,
]);
let balance = 0n,
  price = 1000000n,
  timestamp = 1000,
  signerRequested = 0;
const provider = {
  send: async () => ethers.toQuantity(CONFIG.contributionEconomy.chainId),
  getBlock: async () => ({ timestamp }),
  call: async ({ data, to }) => {
    const f = iface.getFunction(data.slice(0, 10));
    if (f.name === "balanceOf") return iface.encodeFunctionResult(f, [balance]);
    if (f.name === "decimals") return iface.encodeFunctionResult(f, [6]);
    if (f.name === "quoteExactOutput") {
      if (price === 0n) throw new Error("No liquidity");
      return iface.encodeFunctionResult(f, [price, 50000n]);
    }
    throw new Error("Unexpected read");
  },
};
globalThis.__checkoutWeb3 = {
  state: { walletAddress: wallet },
  getProvider: async () => provider,
  switchNetwork: async () => {},
  getBrowserProvider: async () => {
    signerRequested++;
    throw new Error("Reached signer boundary");
  },
};
const url = new URL("../src/services/workflowCheckout.js", import.meta.url);
let source = (await readFile(url, "utf8")).replace(
  /^import \{ web3Service \} from .*;$/m,
  "const web3Service=globalThis.__checkoutWeb3;",
);
source = source.replace(
  /from ['"]([^'"]+)['"]/g,
  (_, spec) =>
    `from '${spec.startsWith(".") ? new URL(spec, url).href : import.meta.resolve(spec)}'`,
);
const { quoteWorkflowCheckout, acquireWorkflowTokens, encodeCheckoutSwap } =
  await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
const agent = {
  tokenAddress: token,
  tokenId: "1",
  decimals: 18,
  chainId: CONFIG.contributionEconomy.chainId,
};
test("exact-output quote buys only the missing tokens with a bounded maximum, no signing", async () => {
  balance = ethers.parseEther("4");
  const q = await quoteWorkflowCheckout(agent, "10", wallet);
  assert.equal(q.output, ethers.parseEther("6").toString());
  assert.equal(q.maximumInput, "1005000");
  assert.equal(q.deadline, 1600);
  assert.equal(signerRequested, 0);
  balance = ethers.parseEther("10");
  await acquireWorkflowTokens(q, agent, "10", wallet);
  assert.equal(signerRequested, 0);
  balance = 0n;
});
test("a changed price, wallet, required amount or missing route stops before wallet authorization", async () => {
  const q = await quoteWorkflowCheckout(agent, "10", wallet);
  price = 1100000n;
  await assert.rejects(
    acquireWorkflowTokens(q, agent, "10", wallet),
    /quote changed/,
  );
  price = 1000000n;
  await assert.rejects(
    acquireWorkflowTokens(q, agent, "11", wallet),
    /quote changed/,
  );
  await assert.rejects(
    acquireWorkflowTokens(q, agent, "10", addr(7)),
    /quote changed/,
  );
  price = 0n;
  await assert.rejects(quoteWorkflowCheckout(agent, "10", wallet), /No liquid/);
  price = 1000000n;
  assert.equal(signerRequested, 0);
});
test("router encoding settles only the capped input and returns all exact output to the caller", async () => {
  const q = await quoteWorkflowCheckout(agent, "10", wallet),
    coder = ethers.AbiCoder.defaultAbiCoder();
  for (const v of ["v1", "v2"]) {
    const e = encodeCheckoutSwap(q, v);
    assert.equal(e.commands, "0x10");
    const [actions, args] = coder.decode(["bytes", "bytes[]"], e.inputs[0]);
    assert.equal(actions, "0x090c0f");
    const [input, cap] = coder.decode(["address", "uint256"], args[1]);
    assert.equal(input.toLowerCase(), usdc);
    assert.equal(cap, 1005000n);
    const [output, min] = coder.decode(["address", "uint256"], args[2]);
    assert.equal(output.toLowerCase(), token);
    assert.equal(min, ethers.parseEther("10"));
  }
  assert.throws(
    () => encodeCheckoutSwap({ ...q, output: "0" }),
    /Invalid swap/,
  );
  assert.throws(() => encodeCheckoutSwap(q, "unknown"), /encoding/);
});
