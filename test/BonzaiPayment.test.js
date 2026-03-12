const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployPayment, deployMockERC20 } = require("./helpers/deploy");
const { PLATFORM_FEE_BPS, PAYMENT_AMOUNT, PAYMENT_AMOUNT_ETH } = require("./helpers/constants");

describe("BonzaiPayment", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build EIP-712 domain for the payment contract
   */
  async function getDomain(payment) {
    return {
      name: "BonzAI x402",
      version: "2",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await payment.getAddress(),
    };
  }

  const EIP712_TYPES = {
    Payment: [
      { name: "provider", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "service", type: "string" },
      { name: "paymentToken", type: "uint8" },
    ],
  };

  /**
   * Get a future deadline (1 hour from latest block)
   */
  async function futureDeadline() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + 3600;
  }

  /**
   * Get a past deadline
   */
  async function pastDeadline() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp - 1;
  }

  /**
   * Mint USDC and approve the payment contract for a consumer
   */
  async function fundConsumerUSDC(usdc, payment, consumer, amount) {
    await usdc.mint(consumer.address, amount);
    await usdc.connect(consumer).approve(await payment.getAddress(), ethers.MaxUint256);
  }

  /**
   * Sign a payment message using EIP-712
   */
  async function signPayment(payment, signer, { provider, amount, nonce, expiry, service, paymentToken }) {
    const domain = await getDomain(payment);
    const value = { provider, amount, nonce, expiry, service, paymentToken };
    return signer.signTypedData(domain, EIP712_TYPES, value);
  }

  // Standard amounts using 18 decimals (MockERC20)
  const USDC_AMOUNT = ethers.parseEther("100");
  const DEPOSIT_AMOUNT = ethers.parseEther("1000");
  const LARGE_AMOUNT = ethers.parseEther("10000");

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      const { payment, owner } = await loadFixture(deployPayment);
      expect(await payment.owner()).to.equal(owner.address);
    });

    it("should set the correct USDC token address", async function () {
      const { payment, usdc } = await loadFixture(deployPayment);
      expect(await payment.usdc()).to.equal(await usdc.getAddress());
    });

    it("should set the correct treasury address", async function () {
      const { payment, treasury } = await loadFixture(deployPayment);
      expect(await payment.treasury()).to.equal(treasury.address);
    });

    it("should set the correct platform fee", async function () {
      const { payment } = await loadFixture(deployPayment);
      expect(await payment.platformFeeBps()).to.equal(PLATFORM_FEE_BPS);
    });

    it("should set the correct EIP-712 domain separator", async function () {
      const { payment } = await loadFixture(deployPayment);
      const separator = await payment.domainSeparator();
      expect(separator).to.not.equal(ethers.ZeroHash);
    });

    it("should have no provider registry set initially", async function () {
      const { payment } = await loadFixture(deployPayment);
      expect(await payment.providerRegistry()).to.equal(ethers.ZeroAddress);
    });

    it("should revert when USDC address is zero", async function () {
      const [, treasury] = await ethers.getSigners();
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      await expect(
        BonzaiPayment.deploy(ethers.ZeroAddress, treasury.address, PLATFORM_FEE_BPS)
      ).to.be.revertedWithCustomError(BonzaiPayment, "ZeroAddress");
    });

    it("should revert when treasury address is zero", async function () {
      const usdc = await deployMockERC20("USDC", "USDC");
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      await expect(
        BonzaiPayment.deploy(await usdc.getAddress(), ethers.ZeroAddress, PLATFORM_FEE_BPS)
      ).to.be.revertedWithCustomError(BonzaiPayment, "ZeroAddress");
    });

    it("should revert when platform fee exceeds MAX_FEE_BPS (10%)", async function () {
      const [, treasury] = await ethers.getSigners();
      const usdc = await deployMockERC20("USDC", "USDC");
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      await expect(
        BonzaiPayment.deploy(await usdc.getAddress(), treasury.address, 1001n)
      ).to.be.revertedWithCustomError(BonzaiPayment, "FeeTooHigh")
        .withArgs(1001n, 1000n);
    });

    it("should allow deploying with zero platform fee", async function () {
      const [, treasury] = await ethers.getSigners();
      const usdc = await deployMockERC20("USDC", "USDC");
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      const payment = await BonzaiPayment.deploy(await usdc.getAddress(), treasury.address, 0);
      expect(await payment.platformFeeBps()).to.equal(0);
    });

    it("should allow deploying with max platform fee (10%)", async function () {
      const [, treasury] = await ethers.getSigners();
      const usdc = await deployMockERC20("USDC", "USDC");
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      const payment = await BonzaiPayment.deploy(await usdc.getAddress(), treasury.address, 1000n);
      expect(await payment.platformFeeBps()).to.equal(1000n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. USDC DEPOSITS & WITHDRAWALS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("USDC Deposits & Withdrawals", function () {
    describe("deposit()", function () {
      it("should deposit USDC and update consumer balance", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);

        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        expect(await payment.balances(consumer1.address)).to.equal(DEPOSIT_AMOUNT);
        expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT);
      });

      it("should emit Deposited event with USDC token type", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);

        await expect(payment.connect(consumer1).deposit(DEPOSIT_AMOUNT))
          .to.emit(payment, "Deposited")
          .withArgs(consumer1.address, DEPOSIT_AMOUNT, 1); // PaymentToken.USDC = 1
      });

      it("should transfer USDC from consumer to contract", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);

        const balanceBefore = await usdc.balanceOf(consumer1.address);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
        const balanceAfter = await usdc.balanceOf(consumer1.address);

        expect(balanceBefore - balanceAfter).to.equal(DEPOSIT_AMOUNT);
        expect(await usdc.balanceOf(await payment.getAddress())).to.equal(DEPOSIT_AMOUNT);
      });

      it("should allow multiple deposits to accumulate", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT * 3n);

        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT * 3n);
      });

      it("should revert when depositing zero amount", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).deposit(0)
        ).to.be.revertedWithCustomError(payment, "ZeroAmount");
      });

      it("should revert when consumer has insufficient USDC", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await usdc.connect(consumer1).approve(await payment.getAddress(), ethers.MaxUint256);
        // Consumer has 0 USDC but tries to deposit
        await expect(
          payment.connect(consumer1).deposit(DEPOSIT_AMOUNT)
        ).to.be.reverted; // ERC20 insufficient balance
      });
    });

    describe("withdraw()", function () {
      it("should withdraw deposited USDC and update balance", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        await payment.connect(consumer1).withdraw(DEPOSIT_AMOUNT);

        expect(await payment.getBalance(consumer1.address)).to.equal(0);
        expect(await usdc.balanceOf(consumer1.address)).to.equal(DEPOSIT_AMOUNT);
      });

      it("should emit Withdrawn event with USDC token type", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        await expect(payment.connect(consumer1).withdraw(DEPOSIT_AMOUNT))
          .to.emit(payment, "Withdrawn")
          .withArgs(consumer1.address, DEPOSIT_AMOUNT, 1); // PaymentToken.USDC = 1
      });

      it("should allow partial withdrawals", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        const halfAmount = DEPOSIT_AMOUNT / 2n;
        await payment.connect(consumer1).withdraw(halfAmount);

        expect(await payment.getBalance(consumer1.address)).to.equal(halfAmount);
      });

      it("should revert with InsufficientBalance when withdrawing more than deposited", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        await expect(
          payment.connect(consumer1).withdraw(DEPOSIT_AMOUNT + 1n)
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert with InsufficientBalance when no deposit exists", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).withdraw(1n)
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ETH DEPOSITS & WITHDRAWALS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("ETH Deposits & Withdrawals", function () {
    describe("depositETH()", function () {
      it("should deposit ETH and update consumer balance", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);

        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        expect(await payment.ethBalances(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH);
        expect(await payment.getETHBalance(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH);
      });

      it("should emit Deposited event with ETH token type", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);

        await expect(payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH }))
          .to.emit(payment, "Deposited")
          .withArgs(consumer1.address, PAYMENT_AMOUNT_ETH, 0); // PaymentToken.ETH = 0
      });

      it("should allow multiple ETH deposits to accumulate", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);

        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        expect(await payment.getETHBalance(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH * 2n);
      });

      it("should revert when depositing zero ETH", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).depositETH({ value: 0 })
        ).to.be.revertedWithCustomError(payment, "ZeroAmount");
      });
    });

    describe("withdrawETH()", function () {
      it("should withdraw deposited ETH and update balance", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const balanceBefore = await ethers.provider.getBalance(consumer1.address);
        const tx = await payment.connect(consumer1).withdrawETH(PAYMENT_AMOUNT_ETH);
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(consumer1.address);

        expect(balanceAfter - balanceBefore + gasCost).to.equal(PAYMENT_AMOUNT_ETH);
        expect(await payment.getETHBalance(consumer1.address)).to.equal(0);
      });

      it("should emit Withdrawn event with ETH token type", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        await expect(payment.connect(consumer1).withdrawETH(PAYMENT_AMOUNT_ETH))
          .to.emit(payment, "Withdrawn")
          .withArgs(consumer1.address, PAYMENT_AMOUNT_ETH, 0); // PaymentToken.ETH = 0
      });

      it("should allow partial ETH withdrawals", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const halfAmount = PAYMENT_AMOUNT_ETH / 2n;
        await payment.connect(consumer1).withdrawETH(halfAmount);

        expect(await payment.getETHBalance(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH - halfAmount);
      });

      it("should revert with InsufficientBalance when withdrawing more than deposited", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        await expect(
          payment.connect(consumer1).withdrawETH(PAYMENT_AMOUNT_ETH + 1n)
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert with InsufficientBalance when no ETH deposit exists", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).withdrawETH(1n)
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PROVIDER EARNINGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Provider Earnings", function () {
    describe("withdrawEarnings() - USDC", function () {
      it("should withdraw accumulated USDC earnings", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        // Make a direct USDC payment to accumulate provider earnings
        await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");

        // Provider should have earnings (amount - platform fee)
        const expectedProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
        expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(expectedProviderAmount);

        // Withdraw earnings
        const balanceBefore = await usdc.balanceOf(provider1.address);
        await payment.connect(provider1).withdrawEarnings();
        const balanceAfter = await usdc.balanceOf(provider1.address);

        expect(balanceAfter - balanceBefore).to.equal(expectedProviderAmount);
        expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(0);
      });

      it("should emit Withdrawn event with USDC token type", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
        await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");

        const expectedProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);

        await expect(payment.connect(provider1).withdrawEarnings())
          .to.emit(payment, "Withdrawn")
          .withArgs(provider1.address, expectedProviderAmount, 1); // PaymentToken.USDC = 1
      });

      it("should revert with NoEarnings when provider has no USDC earnings", async function () {
        const { payment, provider1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(provider1).withdrawEarnings()
        ).to.be.revertedWithCustomError(payment, "NoEarnings");
      });
    });

    describe("withdrawETHEarnings()", function () {
      it("should withdraw accumulated ETH earnings", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);

        // Make a direct ETH payment
        await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH });

        const expectedProviderAmount = PAYMENT_AMOUNT_ETH - (PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n);
        expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(expectedProviderAmount);

        // Withdraw earnings
        const balanceBefore = await ethers.provider.getBalance(provider1.address);
        const tx = await payment.connect(provider1).withdrawETHEarnings();
        const receipt = await tx.wait();
        const gasCost = receipt.gasUsed * receipt.gasPrice;
        const balanceAfter = await ethers.provider.getBalance(provider1.address);

        expect(balanceAfter - balanceBefore + gasCost).to.equal(expectedProviderAmount);
        expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(0);
      });

      it("should emit Withdrawn event with ETH token type", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH });

        const expectedProviderAmount = PAYMENT_AMOUNT_ETH - (PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n);

        await expect(payment.connect(provider1).withdrawETHEarnings())
          .to.emit(payment, "Withdrawn")
          .withArgs(provider1.address, expectedProviderAmount, 0); // PaymentToken.ETH = 0
      });

      it("should revert with NoEarnings when provider has no ETH earnings", async function () {
        const { payment, provider1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(provider1).withdrawETHEarnings()
        ).to.be.revertedWithCustomError(payment, "NoEarnings");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PROCESS PAYMENT (EIP-712 Signed)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Process Payment (EIP-712 signed)", function () {
    describe("USDC signed payments", function () {
      it("should process a valid signed USDC payment", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        // Consumer deposits USDC into the contract (processPayment requires contract to hold USDC)
        await payment.connect(consumer1).deposit(USDC_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1, // USDC
        });

        await payment.processPayment(
          consumer1.address,
          provider1.address,
          USDC_AMOUNT,
          nonce,
          deadline,
          service,
          1, // PaymentToken.USDC
          signature
        );

        // Verify provider earnings
        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = USDC_AMOUNT - platformFee;
        expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(providerAmount);

        // Verify treasury received fee
        expect(await usdc.balanceOf(await payment.treasury())).to.equal(platformFee);

        // Verify nonce is used
        expect(await payment.isNonceUsed(consumer1.address, nonce)).to.be.true;
      });

      it("should emit PaymentProcessed event with correct args for USDC", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        // Consumer deposits USDC into the contract
        await payment.connect(consumer1).deposit(USDC_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "image_turbo";
        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, service, 1, signature
          )
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, USDC_AMOUNT, platformFee, service, 1);
      });
    });

    describe("ETH signed payments", function () {
      it("should process a valid signed ETH payment from deposited balance", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);

        // Consumer deposits ETH first
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: PAYMENT_AMOUNT_ETH,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 0, // ETH
        });

        // processPayment verifies the EIP-712 signature and calls _processPayment,
        // which credits provider earnings and sends the platform fee from contract balance.
        // The consumer must have pre-deposited ETH into the contract.
        await payment.processPayment(
          consumer1.address,
          provider1.address,
          PAYMENT_AMOUNT_ETH,
          nonce,
          deadline,
          service,
          0, // PaymentToken.ETH
          signature
        );

        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = PAYMENT_AMOUNT_ETH - platformFee;
        expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(providerAmount);
      });

      it("should emit PaymentProcessed event with correct args for ETH", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "video_fast";
        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: PAYMENT_AMOUNT_ETH,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 0,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, PAYMENT_AMOUNT_ETH, nonce, deadline, service, 0, signature
          )
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, PAYMENT_AMOUNT_ETH, platformFee, service, 0);
      });
    });

    describe("Revert cases", function () {
      it("should revert with PaymentExpired when signature has expired", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const expiredDeadline = await pastDeadline();
        const nonce = 1;
        const service = "llm_inference";

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: expiredDeadline,
          service,
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, expiredDeadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "PaymentExpired");
      });

      it("should revert with NonceAlreadyUsed when nonce is reused", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        // Deposit enough USDC for the payment (contract needs to hold USDC)
        await payment.connect(consumer1).deposit(USDC_AMOUNT * 2n);

        const deadline = await futureDeadline();
        const nonce = 42;
        const service = "llm_inference";

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        // First call succeeds
        await payment.processPayment(
          consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, service, 1, signature
        );

        // Second call with same nonce reverts
        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "NonceAlreadyUsed");
      });

      it("should revert with InvalidSignature when signature is from wrong signer", async function () {
        const { payment, usdc, provider1, consumer1, consumer2 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        // Sign with consumer2 but claim it's consumer1
        const signature = await signPayment(payment, consumer2, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "InvalidSignature");
      });

      it("should revert with InvalidSignature when amount is tampered", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        // Sign for USDC_AMOUNT but submit with a different amount
        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        const differentAmount = USDC_AMOUNT * 2n;
        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, differentAmount, nonce, deadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "InvalidSignature");
      });

      it("should revert with InvalidSignature when provider is tampered", async function () {
        const { payment, usdc, provider1, provider2, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        // Sign for provider1 but submit with provider2
        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider2.address, USDC_AMOUNT, nonce, deadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "InvalidSignature");
      });

      it("should revert with InvalidSignature when service is tampered", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service: "llm_inference",
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, "image_turbo", 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "InvalidSignature");
      });

      it("should revert with ZeroAmount when amount is zero", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: 0,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1,
        });

        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, 0, nonce, deadline, service, 1, signature
          )
        ).to.be.revertedWithCustomError(payment, "ZeroAmount");
      });

      it("should allow different nonces for the same consumer", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        // Deposit enough USDC for two payments
        await payment.connect(consumer1).deposit(USDC_AMOUNT * 3n);

        const deadline = await futureDeadline();
        const service = "llm_inference";

        // Process with nonce 1
        const sig1 = await signPayment(payment, consumer1, {
          provider: provider1.address, amount: USDC_AMOUNT, nonce: 1, expiry: deadline, service, paymentToken: 1,
        });
        await payment.processPayment(consumer1.address, provider1.address, USDC_AMOUNT, 1, deadline, service, 1, sig1);

        // Process with nonce 2 should succeed
        const sig2 = await signPayment(payment, consumer1, {
          provider: provider1.address, amount: USDC_AMOUNT, nonce: 2, expiry: deadline, service, paymentToken: 1,
        });
        await payment.processPayment(consumer1.address, provider1.address, USDC_AMOUNT, 2, deadline, service, 1, sig2);

        expect(await payment.isNonceUsed(consumer1.address, 1)).to.be.true;
        expect(await payment.isNonceUsed(consumer1.address, 2)).to.be.true;
      });

      it("should revert with InvalidSignature when paymentToken is tampered", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
        // Also deposit ETH so the contract can pay
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const deadline = await futureDeadline();
        const nonce = 1;
        const service = "llm_inference";

        // Sign with paymentToken = 1 (USDC)
        const signature = await signPayment(payment, consumer1, {
          provider: provider1.address,
          amount: USDC_AMOUNT,
          nonce,
          expiry: deadline,
          service,
          paymentToken: 1, // USDC
        });

        // Submit with paymentToken = 0 (ETH)
        await expect(
          payment.processPayment(
            consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, service, 0, signature
          )
        ).to.be.revertedWithCustomError(payment, "InvalidSignature");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DIRECT PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Direct Payments", function () {
    describe("payDirect() - USDC", function () {
      it("should process a direct USDC payment with correct fee split", async function () {
        const { payment, usdc, treasury, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = USDC_AMOUNT - platformFee;

        await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");

        expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(providerAmount);
        expect(await usdc.balanceOf(treasury.address)).to.equal(platformFee);
      });

      it("should emit PaymentProcessed event", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;

        await expect(
          payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "audio_turbo")
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, USDC_AMOUNT, platformFee, "audio_turbo", 1);
      });

      it("should pull USDC from consumer via transferFrom", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        const balanceBefore = await usdc.balanceOf(consumer1.address);
        await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
        const balanceAfter = await usdc.balanceOf(consumer1.address);

        expect(balanceBefore - balanceAfter).to.equal(USDC_AMOUNT);
      });

      it("should revert when provider is zero address", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

        await expect(
          payment.connect(consumer1).payDirect(ethers.ZeroAddress, USDC_AMOUNT, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InvalidProvider");
      });

      it("should revert when consumer has no USDC approval", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await usdc.mint(consumer1.address, LARGE_AMOUNT);
        // No approval

        await expect(
          payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference")
        ).to.be.reverted;
      });
    });

    describe("payDirectETH()", function () {
      it("should process a direct ETH payment with correct fee split", async function () {
        const { payment, treasury, provider1, consumer1 } = await loadFixture(deployPayment);

        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = PAYMENT_AMOUNT_ETH - platformFee;

        const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
        await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH });
        const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

        expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(providerAmount);
        expect(treasuryBalAfter - treasuryBalBefore).to.equal(platformFee);
      });

      it("should emit PaymentProcessed event for ETH", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);

        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;

        await expect(
          payment.connect(consumer1).payDirectETH(provider1.address, "vision_analyze", { value: PAYMENT_AMOUNT_ETH })
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, PAYMENT_AMOUNT_ETH, platformFee, "vision_analyze", 0);
      });

      it("should revert with ZeroAmount when sending zero ETH", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: 0 })
        ).to.be.revertedWithCustomError(payment, "ZeroAmount");
      });

      it("should revert when provider is zero address", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).payDirectETH(ethers.ZeroAddress, "llm_inference", { value: PAYMENT_AMOUNT_ETH })
        ).to.be.revertedWithCustomError(payment, "InvalidProvider");
      });
    });

    describe("payFromBalance() - USDC from deposited balance", function () {
      it("should pay from deposited USDC balance", async function () {
        const { payment, usdc, treasury, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = USDC_AMOUNT - platformFee;

        await payment.connect(consumer1).payFromBalance(provider1.address, USDC_AMOUNT, "llm_inference");

        expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT - USDC_AMOUNT);
        expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(providerAmount);
        expect(await usdc.balanceOf(treasury.address)).to.equal(platformFee);
      });

      it("should emit PaymentProcessed event", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;

        await expect(
          payment.connect(consumer1).payFromBalance(provider1.address, USDC_AMOUNT, "music_gen")
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, USDC_AMOUNT, platformFee, "music_gen", 1);
      });

      it("should revert with InsufficientBalance when balance is too low", async function () {
        const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, USDC_AMOUNT);
        await payment.connect(consumer1).deposit(USDC_AMOUNT);

        await expect(
          payment.connect(consumer1).payFromBalance(provider1.address, USDC_AMOUNT + 1n, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert with InsufficientBalance when no deposit exists", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).payFromBalance(provider1.address, USDC_AMOUNT, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert when provider is zero address", async function () {
        const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
        await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
        await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

        await expect(
          payment.connect(consumer1).payFromBalance(ethers.ZeroAddress, USDC_AMOUNT, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InvalidProvider");
      });
    });

    describe("payFromETHBalance()", function () {
      it("should pay from deposited ETH balance", async function () {
        const { payment, treasury, provider1, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;
        const providerAmount = PAYMENT_AMOUNT_ETH - platformFee;

        const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
        await payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "llm_inference");
        const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);

        expect(await payment.getETHBalance(consumer1.address)).to.equal(0);
        expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(providerAmount);
        expect(treasuryBalAfter - treasuryBalBefore).to.equal(platformFee);
      });

      it("should emit PaymentProcessed event", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        const platformFee = PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n;

        await expect(
          payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "video_gen")
        ).to.emit(payment, "PaymentProcessed")
          .withArgs(consumer1.address, provider1.address, PAYMENT_AMOUNT_ETH, platformFee, "video_gen", 0);
      });

      it("should revert with InsufficientBalance when ETH balance is too low", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        await expect(
          payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH + 1n, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert with InsufficientBalance when no ETH deposit exists", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InsufficientBalance");
      });

      it("should revert when provider is zero address", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });

        await expect(
          payment.connect(consumer1).payFromETHBalance(ethers.ZeroAddress, PAYMENT_AMOUNT_ETH, "llm_inference")
        ).to.be.revertedWithCustomError(payment, "InvalidProvider");
      });

      it("should allow multiple payments from ETH balance", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        const largeDeposit = PAYMENT_AMOUNT_ETH * 5n;
        await payment.connect(consumer1).depositETH({ value: largeDeposit });

        await payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "llm_inference");
        await payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "image_gen");

        expect(await payment.getETHBalance(consumer1.address)).to.equal(largeDeposit - PAYMENT_AMOUNT_ETH * 2n);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. PAUSABLE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Pausable", function () {
    it("should revert processPayment when paused", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
      await payment.connect(consumer1).deposit(USDC_AMOUNT);
      await payment.connect(owner).pause();

      const deadline = await futureDeadline();
      const signature = await signPayment(payment, consumer1, {
        provider: provider1.address, amount: USDC_AMOUNT, nonce: 1, expiry: deadline, service: "llm_inference", paymentToken: 1,
      });

      await expect(
        payment.processPayment(consumer1.address, provider1.address, USDC_AMOUNT, 1, deadline, "llm_inference", 1, signature)
      ).to.be.revertedWithCustomError(payment, "EnforcedPause");
    });

    it("should revert payDirect when paused", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
      await payment.connect(owner).pause();

      await expect(
        payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference")
      ).to.be.revertedWithCustomError(payment, "EnforcedPause");
    });

    it("should revert payDirectETH when paused", async function () {
      const { payment, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await payment.connect(owner).pause();

      await expect(
        payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH })
      ).to.be.revertedWithCustomError(payment, "EnforcedPause");
    });

    it("should revert payFromBalance when paused", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
      await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
      await payment.connect(owner).pause();

      await expect(
        payment.connect(consumer1).payFromBalance(provider1.address, USDC_AMOUNT, "llm_inference")
      ).to.be.revertedWithCustomError(payment, "EnforcedPause");
    });

    it("should revert payFromETHBalance when paused", async function () {
      const { payment, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });
      await payment.connect(owner).pause();

      await expect(
        payment.connect(consumer1).payFromETHBalance(provider1.address, PAYMENT_AMOUNT_ETH, "llm_inference")
      ).to.be.revertedWithCustomError(payment, "EnforcedPause");
    });

    it("should still allow USDC deposits when paused", async function () {
      const { payment, usdc, owner, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
      await payment.connect(owner).pause();

      await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
      expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("should still allow ETH deposits when paused", async function () {
      const { payment, owner, consumer1 } = await loadFixture(deployPayment);
      await payment.connect(owner).pause();

      await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });
      expect(await payment.getETHBalance(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH);
    });

    it("should still allow USDC withdrawals when paused", async function () {
      const { payment, usdc, owner, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
      await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
      await payment.connect(owner).pause();

      await payment.connect(consumer1).withdraw(DEPOSIT_AMOUNT);
      expect(await payment.getBalance(consumer1.address)).to.equal(0);
    });

    it("should still allow ETH withdrawals when paused", async function () {
      const { payment, owner, consumer1 } = await loadFixture(deployPayment);
      await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });
      await payment.connect(owner).pause();

      await payment.connect(consumer1).withdrawETH(PAYMENT_AMOUNT_ETH);
      expect(await payment.getETHBalance(consumer1.address)).to.equal(0);
    });

    it("should still allow provider USDC earnings withdrawals when paused", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // Make a payment first (before pausing)
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      await payment.connect(owner).pause();

      // Provider should still be able to withdraw
      await payment.connect(provider1).withdrawEarnings();
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(0);
    });

    it("should still allow provider ETH earnings withdrawals when paused", async function () {
      const { payment, owner, provider1, consumer1 } = await loadFixture(deployPayment);

      // Make a payment first (before pausing)
      await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH });
      await payment.connect(owner).pause();

      // Provider should still be able to withdraw
      await payment.connect(provider1).withdrawETHEarnings();
      expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(0);
    });

    it("should resume payment processing after unpause", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      await payment.connect(owner).pause();
      await payment.connect(owner).unpause();

      // Payment should work again
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      const platformFee = USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n;
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(USDC_AMOUNT - platformFee);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. ADMIN FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Admin Functions", function () {
    describe("setProviderRegistry()", function () {
      it("should update the provider registry address", async function () {
        const { payment, owner, provider1 } = await loadFixture(deployPayment);
        await payment.connect(owner).setProviderRegistry(provider1.address);
        expect(await payment.providerRegistry()).to.equal(provider1.address);
      });

      it("should emit ProviderRegistryUpdated event", async function () {
        const { payment, owner, provider1 } = await loadFixture(deployPayment);
        await expect(payment.connect(owner).setProviderRegistry(provider1.address))
          .to.emit(payment, "ProviderRegistryUpdated")
          .withArgs(ethers.ZeroAddress, provider1.address);
      });

      it("should emit ProviderRegistryUpdated with old and new addresses", async function () {
        const { payment, owner, provider1, provider2 } = await loadFixture(deployPayment);
        await payment.connect(owner).setProviderRegistry(provider1.address);
        await expect(payment.connect(owner).setProviderRegistry(provider2.address))
          .to.emit(payment, "ProviderRegistryUpdated")
          .withArgs(provider1.address, provider2.address);
      });

      it("should revert when setting registry to zero address", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await expect(
          payment.connect(owner).setProviderRegistry(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(payment, "ZeroAddress");
      });

      it("should revert when called by non-owner", async function () {
        const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).setProviderRegistry(provider1.address)
        ).to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount");
      });
    });

    describe("setPlatformFee()", function () {
      it("should update the platform fee", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await payment.connect(owner).setPlatformFee(500n); // 5%
        expect(await payment.platformFeeBps()).to.equal(500n);
      });

      it("should emit PlatformFeeUpdated event", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await expect(payment.connect(owner).setPlatformFee(500n))
          .to.emit(payment, "PlatformFeeUpdated")
          .withArgs(PLATFORM_FEE_BPS, 500n);
      });

      it("should allow setting fee to zero", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await payment.connect(owner).setPlatformFee(0);
        expect(await payment.platformFeeBps()).to.equal(0);
      });

      it("should allow setting fee to MAX_FEE_BPS (1000 = 10%)", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await payment.connect(owner).setPlatformFee(1000n);
        expect(await payment.platformFeeBps()).to.equal(1000n);
      });

      it("should revert with FeeTooHigh when fee exceeds MAX_FEE_BPS", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await expect(
          payment.connect(owner).setPlatformFee(1001n)
        ).to.be.revertedWithCustomError(payment, "FeeTooHigh")
          .withArgs(1001n, 1000n);
      });

      it("should revert when called by non-owner", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).setPlatformFee(500n)
        ).to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount");
      });
    });

    describe("setTreasury()", function () {
      it("should update the treasury address", async function () {
        const { payment, owner, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(owner).setTreasury(consumer1.address);
        expect(await payment.treasury()).to.equal(consumer1.address);
      });

      it("should emit TreasuryUpdated event", async function () {
        const { payment, owner, treasury, consumer1 } = await loadFixture(deployPayment);
        await expect(payment.connect(owner).setTreasury(consumer1.address))
          .to.emit(payment, "TreasuryUpdated")
          .withArgs(treasury.address, consumer1.address);
      });

      it("should revert with ZeroAddress when setting treasury to zero", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await expect(
          payment.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(payment, "ZeroAddress");
      });

      it("should revert when called by non-owner", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).setTreasury(consumer1.address)
        ).to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount");
      });
    });

    describe("pause() / unpause()", function () {
      it("should allow owner to pause", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await payment.connect(owner).pause();
        expect(await payment.paused()).to.be.true;
      });

      it("should allow owner to unpause", async function () {
        const { payment, owner } = await loadFixture(deployPayment);
        await payment.connect(owner).pause();
        await payment.connect(owner).unpause();
        expect(await payment.paused()).to.be.false;
      });

      it("should revert pause when called by non-owner", async function () {
        const { payment, consumer1 } = await loadFixture(deployPayment);
        await expect(
          payment.connect(consumer1).pause()
        ).to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount");
      });

      it("should revert unpause when called by non-owner", async function () {
        const { payment, owner, consumer1 } = await loadFixture(deployPayment);
        await payment.connect(owner).pause();
        await expect(
          payment.connect(consumer1).unpause()
        ).to.be.revertedWithCustomError(payment, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. PLATFORM FEE CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Platform Fee Calculation", function () {
    it("should calculate 2.5% platform fee correctly for USDC", async function () {
      const { payment, usdc, treasury, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      const amount = ethers.parseEther("1000"); // 1000 USDC
      const expectedFee = amount * 250n / 10000n; // 2.5% = 25 USDC
      const expectedProvider = amount - expectedFee; // 975 USDC

      await payment.connect(consumer1).payDirect(provider1.address, amount, "llm_inference");

      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(expectedProvider);
      expect(await usdc.balanceOf(treasury.address)).to.equal(expectedFee);
    });

    it("should calculate 2.5% platform fee correctly for ETH", async function () {
      const { payment, treasury, provider1, consumer1 } = await loadFixture(deployPayment);

      const amount = ethers.parseEther("1"); // 1 ETH
      const expectedFee = amount * 250n / 10000n; // 0.025 ETH
      const expectedProvider = amount - expectedFee; // 0.975 ETH

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: amount });
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(expectedProvider);
      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    });

    it("should send zero fee to treasury when platform fee is 0%", async function () {
      const { usdc, provider1, consumer1 } = await loadFixture(deployPayment);

      // Deploy new payment contract with 0% fee
      const [owner, treasury] = await ethers.getSigners();
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      const paymentZeroFee = await BonzaiPayment.deploy(await usdc.getAddress(), treasury.address, 0);

      await usdc.mint(consumer1.address, LARGE_AMOUNT);
      await usdc.connect(consumer1).approve(await paymentZeroFee.getAddress(), ethers.MaxUint256);

      const treasuryBefore = await usdc.balanceOf(treasury.address);
      await paymentZeroFee.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      const treasuryAfter = await usdc.balanceOf(treasury.address);

      // 0% fee: all goes to provider, nothing to treasury
      expect(await paymentZeroFee.getPendingWithdrawals(provider1.address)).to.equal(USDC_AMOUNT);
      expect(treasuryAfter - treasuryBefore).to.equal(0);
    });

    it("should calculate correct fee at max rate (10%)", async function () {
      const { usdc, provider1, consumer1 } = await loadFixture(deployPayment);

      // Deploy new payment contract with max fee
      const [owner, treasury] = await ethers.getSigners();
      const BonzaiPayment = await ethers.getContractFactory("BonzaiPayment");
      const paymentMaxFee = await BonzaiPayment.deploy(await usdc.getAddress(), treasury.address, 1000n);

      await usdc.mint(consumer1.address, LARGE_AMOUNT);
      await usdc.connect(consumer1).approve(await paymentMaxFee.getAddress(), ethers.MaxUint256);

      const amount = ethers.parseEther("100");
      const expectedFee = amount * 1000n / 10000n; // 10% = 10
      const expectedProvider = amount - expectedFee; // 90

      await paymentMaxFee.connect(consumer1).payDirect(provider1.address, amount, "llm_inference");

      expect(await paymentMaxFee.getPendingWithdrawals(provider1.address)).to.equal(expectedProvider);
      expect(await usdc.balanceOf(treasury.address)).to.equal(expectedFee);
    });

    it("should handle small amounts without rounding to zero fee", async function () {
      const { payment, usdc, treasury, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // Small amount where 2.5% rounds down to 0
      const smallAmount = 39n; // 39 wei: 39 * 250 / 10000 = 0 (rounds down)
      await payment.connect(consumer1).payDirect(provider1.address, smallAmount, "llm_inference");

      // Fee is 0, all goes to provider
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(smallAmount);
    });

    it("should accumulate earnings from multiple payments", async function () {
      const { payment, usdc, provider1, consumer1, consumer2 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
      await fundConsumerUSDC(usdc, payment, consumer2, LARGE_AMOUNT);

      // Two consumers pay the same provider
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      await payment.connect(consumer2).payDirect(provider1.address, USDC_AMOUNT, "image_turbo");

      const singleProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(singleProviderAmount * 2n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PROVIDER REGISTRY INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Provider Registry Integration", function () {
    it("should not revert when providerRegistry is not set (address zero)", async function () {
      const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // No registry set, should still work
      await expect(
        payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference")
      ).to.not.be.reverted;
    });

    it("should call recordEarnings on the provider registry when set", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // Deploy a real provider registry
      const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
      const [, treasury] = await ethers.getSigners();
      const registry = await BonzaiProviderRegistry.deploy(
        treasury.address,
        ethers.parseEther("0.1"), // minStake
        PLATFORM_FEE_BPS
      );

      // Set the payment contract on the registry
      await registry.setPaymentContract(await payment.getAddress());

      // Set the registry on the payment contract
      await payment.connect(owner).setProviderRegistry(await registry.getAddress());

      // Register the provider on the registry (provider1 needs to register)
      await registry.connect(provider1).register(
        "12D3KooWTest",
        ["/ip4/127.0.0.1/tcp/4001"],
        [0], // LLM pipeline
        ethers.parseEther("0.001"),
        false, // isRelay
        { value: ethers.parseEther("0.1") }
      );

      // Make a payment - should call recordEarnings on registry
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");

      // Check that the registry recorded earnings
      const providerInfo = await registry.providers(provider1.address);
      const expectedProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      expect(providerInfo.totalEarnings).to.equal(expectedProviderAmount);
      expect(providerInfo.completedJobs).to.equal(1);
    });

    it("should not revert if recordEarnings call fails on registry", async function () {
      const { payment, usdc, owner, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // Deploy a real provider registry but DON'T register the provider
      const BonzaiProviderRegistry = await ethers.getContractFactory("BonzaiProviderRegistry");
      const [, treasury] = await ethers.getSigners();
      const registry = await BonzaiProviderRegistry.deploy(
        treasury.address,
        ethers.parseEther("0.1"),
        PLATFORM_FEE_BPS
      );

      // Set the payment contract on the registry
      await registry.setPaymentContract(await payment.getAddress());

      // Set registry on payment contract
      await payment.connect(owner).setProviderRegistry(await registry.getAddress());

      // Provider is NOT registered in the registry. recordEarnings will fail,
      // but the payment contract should catch the error and not revert.
      await expect(
        payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference")
      ).to.not.be.reverted;

      // Payment should still be processed correctly
      const expectedProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(expectedProviderAmount);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("getBalance() should return USDC balance for consumer", async function () {
      const { payment, usdc, consumer1 } = await loadFixture(deployPayment);
      expect(await payment.getBalance(consumer1.address)).to.equal(0);

      await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);
      await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);
      expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT);
    });

    it("getETHBalance() should return ETH balance for consumer", async function () {
      const { payment, consumer1 } = await loadFixture(deployPayment);
      expect(await payment.getETHBalance(consumer1.address)).to.equal(0);

      await payment.connect(consumer1).depositETH({ value: PAYMENT_AMOUNT_ETH });
      expect(await payment.getETHBalance(consumer1.address)).to.equal(PAYMENT_AMOUNT_ETH);
    });

    it("getPendingWithdrawals() should return USDC earnings for provider", async function () {
      const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(0);

      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");

      const expectedProviderAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(expectedProviderAmount);
    });

    it("getPendingETHWithdrawals() should return ETH earnings for provider", async function () {
      const { payment, provider1, consumer1 } = await loadFixture(deployPayment);
      expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(0);

      await payment.connect(consumer1).payDirectETH(provider1.address, "llm_inference", { value: PAYMENT_AMOUNT_ETH });

      const expectedProviderAmount = PAYMENT_AMOUNT_ETH - (PAYMENT_AMOUNT_ETH * PLATFORM_FEE_BPS / 10000n);
      expect(await payment.getPendingETHWithdrawals(provider1.address)).to.equal(expectedProviderAmount);
    });

    it("isNonceUsed() should return false for unused nonce", async function () {
      const { payment, consumer1 } = await loadFixture(deployPayment);
      expect(await payment.isNonceUsed(consumer1.address, 1)).to.be.false;
      expect(await payment.isNonceUsed(consumer1.address, 999)).to.be.false;
    });

    it("isNonceUsed() should return true after nonce is used", async function () {
      const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // Deposit USDC so contract holds funds for the signed payment
      await payment.connect(consumer1).deposit(USDC_AMOUNT);

      const deadline = await futureDeadline();
      const signature = await signPayment(payment, consumer1, {
        provider: provider1.address, amount: USDC_AMOUNT, nonce: 42, expiry: deadline, service: "llm_inference", paymentToken: 1,
      });

      await payment.processPayment(consumer1.address, provider1.address, USDC_AMOUNT, 42, deadline, "llm_inference", 1, signature);
      expect(await payment.isNonceUsed(consumer1.address, 42)).to.be.true;
    });

    it("domainSeparator() should return consistent value", async function () {
      const { payment } = await loadFixture(deployPayment);
      const sep1 = await payment.domainSeparator();
      const sep2 = await payment.domainSeparator();
      expect(sep1).to.equal(sep2);
      expect(sep1).to.not.equal(ethers.ZeroHash);
    });

    it("PAYMENT_TYPEHASH should be correctly computed", async function () {
      const { payment } = await loadFixture(deployPayment);
      const expectedHash = ethers.keccak256(
        ethers.toUtf8Bytes("Payment(address provider,uint256 amount,uint256 nonce,uint256 expiry,string service,uint8 paymentToken)")
      );
      expect(await payment.PAYMENT_TYPEHASH()).to.equal(expectedHash);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIVE FUNCTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe("receive()", function () {
    it("should accept direct ETH transfers", async function () {
      const { payment, consumer1 } = await loadFixture(deployPayment);
      const paymentAddr = await payment.getAddress();

      await consumer1.sendTransaction({ to: paymentAddr, value: ethers.parseEther("1") });
      expect(await ethers.provider.getBalance(paymentAddr)).to.equal(ethers.parseEther("1"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES / MULTI-PROVIDER
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Edge Cases", function () {
    it("should handle payments to multiple providers independently", async function () {
      const { payment, usdc, provider1, provider2, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      await payment.connect(consumer1).payDirect(provider2.address, USDC_AMOUNT * 2n, "image_turbo");

      const providerAmount1 = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      const providerAmount2 = (USDC_AMOUNT * 2n) - ((USDC_AMOUNT * 2n) * PLATFORM_FEE_BPS / 10000n);

      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(providerAmount1);
      expect(await payment.getPendingWithdrawals(provider2.address)).to.equal(providerAmount2);
    });

    it("should handle provider withdrawing then accumulating again", async function () {
      const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);

      // First payment
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      await payment.connect(provider1).withdrawEarnings();
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(0);

      // Second payment
      await payment.connect(consumer1).payDirect(provider1.address, USDC_AMOUNT, "llm_inference");
      const providerAmount = USDC_AMOUNT - (USDC_AMOUNT * PLATFORM_FEE_BPS / 10000n);
      expect(await payment.getPendingWithdrawals(provider1.address)).to.equal(providerAmount);
    });

    it("should handle nonces from different consumers independently", async function () {
      const { payment, usdc, provider1, consumer1, consumer2 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, LARGE_AMOUNT);
      await fundConsumerUSDC(usdc, payment, consumer2, LARGE_AMOUNT);

      // Both consumers deposit USDC so the contract has funds
      await payment.connect(consumer1).deposit(USDC_AMOUNT);
      await payment.connect(consumer2).deposit(USDC_AMOUNT);

      const deadline = await futureDeadline();
      const nonce = 1; // Same nonce for both consumers

      const sig1 = await signPayment(payment, consumer1, {
        provider: provider1.address, amount: USDC_AMOUNT, nonce, expiry: deadline, service: "llm_inference", paymentToken: 1,
      });
      const sig2 = await signPayment(payment, consumer2, {
        provider: provider1.address, amount: USDC_AMOUNT, nonce, expiry: deadline, service: "llm_inference", paymentToken: 1,
      });

      // Both should succeed with the same nonce (different consumers)
      await payment.processPayment(consumer1.address, provider1.address, USDC_AMOUNT, nonce, deadline, "llm_inference", 1, sig1);
      await payment.processPayment(consumer2.address, provider1.address, USDC_AMOUNT, nonce, deadline, "llm_inference", 1, sig2);

      expect(await payment.isNonceUsed(consumer1.address, nonce)).to.be.true;
      expect(await payment.isNonceUsed(consumer2.address, nonce)).to.be.true;
    });

    it("should handle consumer depositing and paying from balance in same transaction flow", async function () {
      const { payment, usdc, provider1, consumer1 } = await loadFixture(deployPayment);
      await fundConsumerUSDC(usdc, payment, consumer1, DEPOSIT_AMOUNT);

      // Deposit
      await payment.connect(consumer1).deposit(DEPOSIT_AMOUNT);

      // Pay from balance multiple times
      const smallPayment = ethers.parseEther("10");
      for (let i = 0; i < 5; i++) {
        await payment.connect(consumer1).payFromBalance(provider1.address, smallPayment, `service_${i}`);
      }

      expect(await payment.getBalance(consumer1.address)).to.equal(DEPOSIT_AMOUNT - smallPayment * 5n);
    });
  });
});
