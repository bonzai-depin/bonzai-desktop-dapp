// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBasketLiquidityFactory { function liquidityVault() external view returns(address); }
interface IBasketLiquidityVault { function factory() external view returns(address); }
interface IBasketStakeHistory {
    function rewardStakeSeconds(address wallet, uint8 level, uint256 start, uint256 end) external view returns (uint256);
    function totalRewardStakeSeconds(uint8 level, uint256 start, uint256 end) external view returns (uint256);
}

interface IBasketSocialTokenFactory {
    function getToken(uint256 agentId) external view returns (address);
    function companionContract() external view returns (address);
}

/// @notice Actual collected fees, separately accounted in every currency.
/// Each deposit funds all six cumulative LVL tranches equally, with remainder
/// in LVL 1. Rewards use committed BONZAI-seconds during that weekly epoch.
/// No registrations, self-mints, claim deadlines, token conversions or emissions.
contract BonzaiBasketRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IBasketStakeHistory public immutable stakingVault;
    IBasketSocialTokenFactory public immutable socialTokenFactory;
    address public immutable smartAgents;
    uint256 public immutable genesisTime;
    uint256 public immutable epochDuration;
    uint256 public constant MAX_CLAIM_EPOCHS = 32;
    mapping(address => bool) public rewardCurrencyEnabled;
    mapping(address => bool) public liquidityFactoryEnabled;
    event LiquidityFactoryUpdated(address indexed factory,bool enabled);
    mapping(address => bool) private knownCurrency;
    address[] private currencies;
    mapping(address => mapping(uint256 => uint256[6])) private rewards;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    mapping(address => mapping(uint256 => mapping(uint8 => bool))) public emptyTrancheRolled;
    mapping(address => uint256) public totalDeposited;
    mapping(address => uint256) public totalClaimed;

    event RewardCurrencyUpdated(address indexed currency, bool enabled);
    event FeesDeposited(address indexed currency, address indexed source, uint256 indexed epoch, uint256 amount);
    event BasketRewardClaimed(address indexed wallet, address indexed currency, address indexed recipient, uint256 amount);
    event EmptyTrancheRolled(address indexed currency, uint256 indexed epoch, uint8 indexed level, uint256 targetEpoch, uint256 amount);

    constructor(address vault, address factory, uint256 duration) Ownable(msg.sender) {
        require(vault.code.length > 0 && factory.code.length > 0, "Invalid economy contracts");
        require(duration >= 1 days && duration <= 30 days, "Invalid epoch duration");
        stakingVault = IBasketStakeHistory(vault);
        socialTokenFactory = IBasketSocialTokenFactory(factory);
        smartAgents = IBasketSocialTokenFactory(factory).companionContract();
        require(smartAgents.code.length > 0, "Invalid smart-agent registry");
        epochDuration = duration;
        genesisTime = block.timestamp;
        _enableCurrency(address(0), true);
    }

    function currentEpoch() public view returns (uint256) { return (block.timestamp - genesisTime) / epochDuration; }
    function epochStart(uint256 epoch) public view returns (uint256) { return genesisTime + epoch * epochDuration; }

    /// @notice Governance admits verified settlement currencies such as USDC.
    /// Disabling new deposits never disables accrued claims.
    function setRewardCurrency(address currency, bool enabled) external onlyOwner {
        require(currency == address(0) || currency.code.length > 0, "Invalid currency");
        _enableCurrency(currency, enabled);
    }

    /// @notice Anyone can admit the exact social token issued by the canonical factory.
    function registerSocialToken(uint256 agentId) external returns (address token) {
        require(socialTokenFactory.companionContract() == smartAgents, "Smart-agent registry changed");
        token = socialTokenFactory.getToken(agentId);
        require(token != address(0) && token.code.length > 0, "Agent token not issued");
        // A governance-disabled currency cannot be silently re-enabled.
        if (!knownCurrency[token]) _enableCurrency(token, true);
    }

    /// Governance admits audited factories; their immutable vaults may register only launch currencies.
    function setLiquidityFactory(address factory,bool enabled) external onlyOwner {
        require(factory.code.length>0,"Invalid factory");liquidityFactoryEnabled[factory]=enabled;
        emit LiquidityFactoryUpdated(factory,enabled);
    }
    function registerLiquidityCurrency(address currency) external {
        address factory=IBasketLiquidityVault(msg.sender).factory();
        require(liquidityFactoryEnabled[factory] && IBasketLiquidityFactory(factory).liquidityVault()==msg.sender,"Untrusted liquidity vault");
        require(currency==address(0) || currency.code.length>0,"Invalid currency");
        if(!knownCurrency[currency]) _enableCurrency(currency,true);
    }

    function _enableCurrency(address currency, bool enabled) private {
        if (!knownCurrency[currency]) { knownCurrency[currency] = true; currencies.push(currency); }
        rewardCurrencyEnabled[currency] = enabled;
        emit RewardCurrencyUpdated(currency, enabled);
    }

    function depositNative() external payable nonReentrant { _deposit(address(0), msg.value); }

    function depositToken(address currency, uint256 amount) external nonReentrant {
        require(currency != address(0) && rewardCurrencyEnabled[currency], "Currency unavailable");
        uint256 beforeBalance = IERC20(currency).balanceOf(address(this));
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(currency).balanceOf(address(this)) - beforeBalance == amount, "Unsupported transfer fee");
        _deposit(currency, amount);
    }

    function _deposit(address currency, uint256 amount) private {
        require(rewardCurrencyEnabled[currency] && amount > 0, "Invalid deposit");
        uint256 epoch = currentEpoch();
        uint256 slice = amount / 6;
        for (uint8 i; i < 6; ++i) rewards[currency][epoch][i] += i == 0 ? amount - slice * 5 : slice;
        totalDeposited[currency] += amount;
        emit FeesDeposited(currency, msg.sender, epoch, amount);
    }

    function getEpochRewards(address currency, uint256 epoch) external view returns (uint256[6] memory) { return rewards[currency][epoch]; }
    function rewardCurrencyCount() external view returns (uint256) { return currencies.length; }
    function getRewardCurrencies(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        require(limit <= 100, "Page too large");
        uint256 count = offset >= currencies.length ? 0 : Math.min(limit, currencies.length - offset);
        result = new address[](count);
        for (uint256 i; i < count; ++i) result[i] = currencies[offset + i];
    }

    function claimable(address wallet, address currency, uint256 epoch) public view returns (uint256 amount) {
        if (epoch >= currentEpoch() || claimed[currency][epoch][wallet]) return 0;
        uint256 start = epochStart(epoch);
        uint256 end = start + epochDuration;
        for (uint8 level = 1; level <= 6; ++level) {
            uint256 allocation = rewards[currency][epoch][level - 1];
            if (allocation == 0 || emptyTrancheRolled[currency][epoch][level]) continue;
            uint256 weight = stakingVault.rewardStakeSeconds(wallet, level, start, end);
            if (weight == 0) continue;
            uint256 totalWeight = stakingVault.totalRewardStakeSeconds(level, start, end);
            amount += Math.mulDiv(allocation, weight, totalWeight);
        }
    }

    function claim(address currency, uint256[] calldata epochs, address payable recipient) external nonReentrant returns (uint256 amount) {
        require(recipient != address(0), "Invalid recipient");
        require(epochs.length > 0 && epochs.length <= MAX_CLAIM_EPOCHS, "Invalid claim batch");
        for (uint256 i; i < epochs.length; ++i) {
            require(epochs[i] < currentEpoch(), "Epoch not closed");
            if (claimed[currency][epochs[i]][msg.sender]) continue;
            amount += claimable(msg.sender, currency, epochs[i]);
            claimed[currency][epochs[i]][msg.sender] = true;
        }
        require(amount > 0, "Nothing to claim");
        totalClaimed[currency] += amount;
        if (currency == address(0)) {
            (bool paid,) = recipient.call{value: amount}("");
            require(paid, "Native claim failed");
        } else IERC20(currency).safeTransfer(recipient, amount);
        emit BasketRewardClaimed(msg.sender, currency, recipient, amount);
    }

    /// @notice Only a tranche with nobody eligible may roll forward. Earned
    /// rewards are never swept or reassigned, including after stake exit.
    function rollEmptyTranche(address currency, uint256 epoch, uint8 level) external {
        require(epoch < currentEpoch() && level >= 1 && level <= 6, "Invalid tranche");
        require(!emptyTrancheRolled[currency][epoch][level], "Already rolled");
        uint256 start = epochStart(epoch);
        require(stakingVault.totalRewardStakeSeconds(level, start, start + epochDuration) == 0, "Tranche has members");
        uint256 amount = rewards[currency][epoch][level - 1];
        require(amount > 0, "Empty tranche");
        emptyTrancheRolled[currency][epoch][level] = true;
        rewards[currency][currentEpoch()][level - 1] += amount;
        emit EmptyTrancheRolled(currency, epoch, level, currentEpoch(), amount);
    }
}
