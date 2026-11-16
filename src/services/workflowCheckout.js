import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { web3Service } from "./web3.service.js";
import { assertNoPendingPayment } from "./transactionJournal.js";
import { confirmedReceipt } from "./transactionReceipt.js";
const PATH =
  "tuple(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[]";
const QUOTER = [
  `function quoteExactOutput(tuple(address exactCurrency,${PATH} path,uint128 exactAmount)) returns(uint256 amountIn,uint256 gasEstimate)`,
];
const TOKEN = [
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
];
const PERMIT = [
  "function allowance(address,address,address) view returns(uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address,address,uint160,uint48)",
];
const ROUTER = ["function execute(bytes,bytes[],uint256) payable"];
const routeConfig = () => CONFIG.uniswap[ECONOMY_NETWORK_KEY];
export const stablecoinCheckoutConfigured = () =>
  [
    CONFIG.basketRewards.usdcAddress,
    routeConfig()?.quoter,
    routeConfig()?.universalRouter,
    routeConfig()?.permit2,
  ].every((a) => ethers.isAddress(a || "") && a !== ethers.ZeroAddress);
export function encodeCheckoutSwap(quote, version = "v1") {
  if (!["v1", "v2"].includes(version))
    throw new Error("Unsupported router encoding.");
  const amount = BigInt(quote.output),
    cap = BigInt(quote.maximumInput);
  if (amount <= 0n || cap <= 0n || amount >= 2n ** 128n || cap >= 2n ** 128n)
    throw new Error("Invalid swap amounts.");
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const schema = `tuple(address currencyOut,${PATH} path,${version === "v2" ? "uint256[] minHopPriceX36," : ""}uint128 amountOut,uint128 amountInMaximum)`;
  const values = [
    quote.token,
    quote.path,
    ...(version === "v2" ? [[]] : []),
    amount,
    cap,
  ];
  return {
    commands: "0x10",
    inputs: [
      coder.encode(
        ["bytes", "bytes[]"],
        [
          "0x090c0f",
          [
            coder.encode([schema], [values]),
            coder.encode(["address", "uint256"], [quote.usdc, cap]),
            coder.encode(["address", "uint256"], [quote.token, amount]),
          ],
        ],
      ),
    ],
    deadline: quote.deadline,
  };
}
/** Bounded hookless routes only. No external aggregator or arbitrary calldata. */
export async function quoteWorkflowCheckout(
  agentQuote,
  amountText,
  wallet,
  slippageBps = 50,
) {
  if (!stablecoinCheckoutConfigured())
    throw new Error(
      "USDC checkout requires the configured USDC and Uniswap contracts.",
    );
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 300)
    throw new Error("Slippage must be between 0.01% and 3%.");
  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY),
    cfg = routeConfig(),
    usdc = CONFIG.basketRewards.usdcAddress;
  const token = new ethers.Contract(agentQuote.tokenAddress, TOKEN, provider),
    input = new ethers.Contract(usdc, TOKEN, provider);
  const [balance, decimals, block] = await Promise.all([
    token.balanceOf(wallet),
    input.decimals(),
    provider.getBlock("latest"),
  ]);
  if (Number(decimals) !== 6)
    throw new Error(
      "The configured settlement token must be six-decimal USDC.",
    );
  const required = ethers.parseUnits(amountText, agentQuote.decimals),
    shortfall = required > balance ? required - balance : 0n;
  if (required <= 0n) throw new Error("Enter a positive job amount.");
  if (shortfall === 0n)
    return {
      output: "0",
      maximumInput: "0",
      input: "0",
      wallet,
      token: agentQuote.tokenAddress,
      usdc,
      required: required.toString(),
      chainId: agentQuote.chainId,
    };
  const hop = (currency, fee, tickSpacing) => ({
    intermediateCurrency: currency,
    fee,
    tickSpacing,
    hooks: ethers.ZeroAddress,
    hookData: "0x",
  });
  const candidates = [
    ...[
      [100, 1],
      [500, 10],
      [3000, 60],
      [10000, 60],
    ].map(([f, s]) => [hop(usdc, f, s)]),
  ];
  // Successor agents are launched against NVDA. Discover that identity from the canonical factory.
  if (CONFIG.smartAgentIssuance.factoryAddress) {
    const f = new ethers.Contract(
      CONFIG.smartAgentIssuance.factoryAddress,
      [
        "function getToken(uint256) view returns(address)",
        "function nvda() view returns(address)",
      ],
      provider,
    );
    if (
      (await f.getToken(agentQuote.tokenId)).toLowerCase() ===
      agentQuote.tokenAddress.toLowerCase()
    ) {
      const nvda = await f.nvda();
      if (nvda.toLowerCase() !== usdc.toLowerCase())
        for (const [fee, spacing] of [
          [100, 1],
          [500, 10],
          [3000, 60],
          [10000, 60],
        ])
          candidates.push([hop(usdc, fee, spacing), hop(nvda, 10000, 60)]);
    }
  }
  const quoter = new ethers.Contract(cfg.quoter, QUOTER, provider),
    quotes = [];
  for (const path of candidates) {
    try {
      const result = await quoter.quoteExactOutput.staticCall([
        agentQuote.tokenAddress,
        path,
        shortfall,
      ]);
      if (result.amountIn > 0n) quotes.push({ path, input: result.amountIn });
    } catch {
      /* no executable pool on this route */
    }
  }
  quotes.sort((a, b) => (a.input < b.input ? -1 : a.input > b.input ? 1 : 0));
  if (!quotes.length)
    throw new Error(
      "No liquid USDC route can fill this payment. No funds have been spent.",
    );
  const best = quotes[0],
    maximum = (best.input * BigInt(10000 + slippageBps) + 9999n) / 10000n;
  return {
    wallet,
    token: agentQuote.tokenAddress,
    usdc,
    required: required.toString(),
    output: shortfall.toString(),
    input: best.input.toString(),
    maximumInput: maximum.toString(),
    path: best.path,
    chainId: agentQuote.chainId,
    deadline: Number(block.timestamp) + 600,
    router: cfg.universalRouter,
    permit2: cfg.permit2,
    routerVersion: cfg.routerAbiVersion || "v1",
  };
}
export async function acquireWorkflowTokens(
  reviewed,
  agentQuote,
  amountText,
  expectedWallet,
) {
  await assertNoPendingPayment(
    agentQuote.chainId,
    expectedWallet,
    await web3Service.getProvider(ECONOMY_NETWORK_KEY),
    [routeConfig().universalRouter],
  );
  const current = await quoteWorkflowCheckout(
    agentQuote,
    amountText,
    expectedWallet,
  );
  if (current.output === "0") return; // Successful swap + interrupted escrow: use the wallet balance, never rebuy.
  if (
    !reviewed ||
    reviewed.wallet?.toLowerCase() !== expectedWallet.toLowerCase() ||
    current.required !== reviewed.required ||
    current.token.toLowerCase() !== reviewed.token.toLowerCase() ||
    current.usdc.toLowerCase() !== reviewed.usdc.toLowerCase() ||
    current.router !== reviewed.router ||
    current.permit2 !== reviewed.permit2 ||
    current.routerVersion !== reviewed.routerVersion ||
    BigInt(current.input) > BigInt(reviewed.maximumInput)
  )
    throw new Error("The checkout quote changed. Review payment again.");
  await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
  const signer = await (await web3Service.getBrowserProvider()).getSigner();
  async function verify() {
    if (
      (await signer.getAddress()).toLowerCase() !==
        expectedWallet.toLowerCase() ||
      web3Service.state.walletAddress?.toLowerCase() !==
        expectedWallet.toLowerCase() ||
      Number(BigInt(await signer.provider.send("eth_chainId", []))) !==
        Number(current.chainId)
    )
      throw new Error("Wallet or network changed. Review payment again.");
    if (
      Number((await signer.provider.getBlock("latest")).timestamp) >=
      reviewed.deadline
    )
      throw new Error("Checkout quote expired. Review payment again.");
  }
  await verify();
  const cap = BigInt(reviewed.maximumInput),
    usdc = new ethers.Contract(current.usdc, TOKEN, signer),
    permits = new ethers.Contract(current.permit2, PERMIT, signer);
  if ((await usdc.balanceOf(expectedWallet)) < cap)
    throw new Error("Insufficient USDC for the reviewed maximum payment.");
  const allowance = await usdc.allowance(expectedWallet, current.permit2);
  if (allowance < cap) {
    if (allowance > 0n) {
      await confirmedReceipt(await usdc.approve(current.permit2, 0));
      await verify();
    }
    await confirmedReceipt(await usdc.approve(current.permit2, cap));
    await verify();
  }
  await confirmedReceipt(
    await permits.approve(current.usdc, current.router, cap, reviewed.deadline),
  );
  await verify();
  const swap = encodeCheckoutSwap(
      {
        ...current,
        maximumInput: reviewed.maximumInput,
        deadline: reviewed.deadline,
      },
      current.routerVersion,
    ),
    router = new ethers.Contract(current.router, ROUTER, signer);
  await router.execute.staticCall(swap.commands, swap.inputs, swap.deadline);
  await verify();
  await confirmedReceipt(
    await router.execute(swap.commands, swap.inputs, swap.deadline),
  );
  // TAKE_ALL delivers the purchased tokens directly to the paying wallet.
  // Subsequent escrow failure cannot strand them in an intermediate contract.
}
