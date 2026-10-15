// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBonzaiStakingVault {
    function utilityWeight(address wallet) external view returns (uint256);
}
interface IRevenueBasketRewards {
    function stakingVault() external view returns (address);
    function depositNative() external payable;
    function depositToken(address currency, uint256 amount) external;
    function rewardCurrencyEnabled(address currency) external view returns (bool);
}

/**
 * @title BonzaiRevenueRouter
 * @notice Preserves immutable contribution royalties while distributing a
 * separate staking bonus to active contributors.
 */
contract BonzaiRevenueRouter is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_ROUTE_RECIPIENTS = 64;
    IBonzaiStakingVault public stakingVault;
    address public treasury;
    uint16 public treasuryBps = 1_000;
    uint16 public stakingRewardBps = 1_000;
    IRevenueBasketRewards public basketRewards;

    struct RouteRecipient {
        address wallet;
        uint16 baseBps;
        uint16 contributionScore;
        string role;
    }

    struct Route {
        address publisher;
        string metadataURI;
        bool active;
        uint256 createdAt;
        uint256 totalReceived;
        uint16 treasuryFeeBps;
        uint16 stakingBonusBps;
        address rewardBasket;
        RouteRecipient[] recipients;
    }

    mapping(bytes32 => Route) private routes;
    mapping(bytes32 => mapping(address => uint256)) public claimable;
    mapping(bytes32 => uint256) public routedRevenue;
    mapping(bytes32 => mapping(address => mapping(address => uint256))) public tokenClaimable;
    mapping(bytes32 => mapping(address => uint256)) public tokenRevenueReceived;
    mapping(address => mapping(address => uint256)) public tokenTreasuryClaimable;

    event BasketRewardsConfigured(address indexed rewards);
    event TokenRevenueReceived(bytes32 indexed assetId, address indexed currency, address indexed payer, uint256 amount, uint256 treasuryAmount, uint256 contributorAmount, uint256 holderAmount);
    event TokenClaimed(bytes32 indexed assetId, address indexed currency, address indexed recipient, uint256 amount);

    event StakingVaultUpdated(address indexed oldVault, address indexed newVault);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event TreasuryBpsUpdated(uint16 oldBps, uint16 newBps);
    event StakingRewardBpsUpdated(uint16 oldBps, uint16 newBps);
    event RouteRegistered(bytes32 indexed assetId, address indexed publisher, string metadataURI, uint256 recipientCount);
    event RevenueReceived(bytes32 indexed assetId, address indexed payer, uint256 amount, uint256 treasuryAmount, uint256 contributorAmount, uint256 stakingRewardAmount);
    event Claimed(bytes32 indexed assetId, address indexed recipient, uint256 amount);

    error InvalidBps();
    error InvalidTreasury();
    error InvalidRecipient();
    error EmptyRoute();
    error TooManyRecipients(uint256 count);
    error RouteNotFound(bytes32 assetId);
    error NothingToClaim();
    error RouteAlreadyOwned(bytes32 assetId);
    error RouteLocked(bytes32 assetId);

    constructor(address _stakingVault, address _treasury) Ownable(msg.sender) {
        require(_stakingVault != address(0), "Invalid vault");
        require(_treasury != address(0), "Invalid treasury");
        stakingVault = IBonzaiStakingVault(_stakingVault);
        treasury = _treasury;
    }

    function registerRoute(
        bytes32 sourceAssetId,
        string calldata metadataURI,
        address[] calldata wallets,
        uint16[] calldata baseBps,
        uint16[] calldata contributionScores,
        string[] calldata roles
    ) external whenNotPaused returns (bytes32 assetId) {
        if (wallets.length == 0) revert EmptyRoute();
        if (wallets.length > MAX_ROUTE_RECIPIENTS) revert TooManyRecipients(wallets.length);
        if (wallets.length != baseBps.length || wallets.length != contributionScores.length || wallets.length != roles.length) {
            revert InvalidRecipient();
        }

        assetId = routeIdFor(msg.sender, sourceAssetId);
        Route storage route = routes[assetId];
        if (route.createdAt != 0) revert RouteLocked(assetId);

        uint256 totalBps = 0;
        delete route.recipients;
        route.publisher = msg.sender;
        route.metadataURI = metadataURI;
        route.active = true;
        route.treasuryFeeBps = treasuryBps;
        route.stakingBonusBps = stakingRewardBps;
        route.rewardBasket = address(basketRewards);
        if (route.createdAt == 0) {
            route.createdAt = block.timestamp;
        }

        for (uint256 i = 0; i < wallets.length; ) {
            if (wallets[i] == address(0) || contributionScores[i] > BPS) revert InvalidRecipient();
            for (uint256 j = 0; j < i; ++j) {
                if (wallets[j] == wallets[i]) revert InvalidRecipient();
            }
            totalBps += baseBps[i];
            route.recipients.push(RouteRecipient({
                wallet: wallets[i],
                baseBps: baseBps[i],
                contributionScore: contributionScores[i],
                role: roles[i]
            }));
            unchecked { i++; }
        }
        if (totalBps != BPS) revert InvalidBps();

        emit RouteRegistered(assetId, msg.sender, metadataURI, wallets.length);
    }

    /// @notice Publisher-scoped IDs prevent front-running another publisher's royalties.
    function routeIdFor(address publisher, bytes32 sourceAssetId) public pure returns (bytes32) {
        return keccak256(abi.encode(publisher, sourceAssetId));
    }

    function depositRevenue(bytes32 assetId) external payable nonReentrant whenNotPaused {
        Route storage route = routes[assetId];
        if (!route.active) revert RouteNotFound(assetId);
        require(msg.value > 0, "No revenue");

        uint256 treasuryAmount = msg.value * route.treasuryFeeBps / BPS;
        uint256 stakingRewardAmount = msg.value * route.stakingBonusBps / BPS;
        uint256 contributorAmount = msg.value - treasuryAmount - stakingRewardAmount;
        route.totalReceived += msg.value;
        routedRevenue[assetId] += contributorAmount;

        (bool sentTreasury, ) = treasury.call{value: treasuryAmount}("");
        require(sentTreasury, "Treasury transfer failed");

        uint256 allocated = 0;
        uint256 lastPositive;
        for (uint256 i; i < route.recipients.length; ++i) if (route.recipients[i].baseBps > 0) lastPositive = i;
        for (uint256 i = 0; i < route.recipients.length; ) {
            RouteRecipient storage recipient = route.recipients[i];
            uint256 share = i == lastPositive
                ? contributorAmount - allocated
                : contributorAmount * recipient.baseBps / BPS;
            allocated += share;
            claimable[assetId][recipient.wallet] += share;
            unchecked { i++; }
        }

        if (route.rewardBasket != address(0)) {
            if (stakingRewardAmount > 0) IRevenueBasketRewards(route.rewardBasket).depositNative{value: stakingRewardAmount}();
            emit RevenueReceived(assetId, msg.sender, msg.value, treasuryAmount, contributorAmount, stakingRewardAmount);
            return;
        }

        uint256 totalWeight = 0;
        uint256 lastEligibleRecipient = 0;
        uint256[] memory weights = new uint256[](route.recipients.length);
        for (uint256 i = 0; i < route.recipients.length; ) {
            RouteRecipient storage recipient = route.recipients[i];
            uint256 stakeWeight = stakingVault.utilityWeight(recipient.wallet);
            uint256 weight = stakeWeight * (BPS + recipient.contributionScore) / BPS;
            weights[i] = weight;
            if (weight > 0) lastEligibleRecipient = i;
            totalWeight += weight;
            unchecked { i++; }
        }

        if (totalWeight == 0) {
            (bool sentUnusedBonus, ) = treasury.call{value: stakingRewardAmount}("");
            require(sentUnusedBonus, "Bonus transfer failed");
        } else {
            uint256 bonusAllocated = 0;
            for (uint256 i = 0; i < route.recipients.length; ) {
                uint256 bonus = i == lastEligibleRecipient
                    ? stakingRewardAmount - bonusAllocated
                    : stakingRewardAmount * weights[i] / totalWeight;
                bonusAllocated += bonus;
                claimable[assetId][route.recipients[i].wallet] += bonus;
                unchecked { i++; }
            }
        }

        emit RevenueReceived(assetId, msg.sender, msg.value, treasuryAmount, contributorAmount, stakingRewardAmount);
    }

    /// @notice New currency routes preserve the registered creator split and send
    /// the separate holder allocation to every eligible BONZAI LVL, not just authors.
    function depositTokenRevenue(bytes32 assetId, address currency, uint256 amount) external nonReentrant whenNotPaused {
        Route storage route = routes[assetId];
        if (!route.active) revert RouteNotFound(assetId);
        require(currency != address(0) && amount > 0 && route.rewardBasket != address(0), "Basket currency route required");
        require(IRevenueBasketRewards(route.rewardBasket).rewardCurrencyEnabled(currency), "Currency unavailable");
        uint256 beforeBalance = IERC20(currency).balanceOf(address(this));
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(currency).balanceOf(address(this)) - beforeBalance == amount, "Unsupported transfer fee");
        uint256 treasuryAmount = amount * route.treasuryFeeBps / BPS;
        uint256 holderAmount = amount * route.stakingBonusBps / BPS;
        uint256 contributorAmount = amount - treasuryAmount - holderAmount;
        tokenRevenueReceived[assetId][currency] += amount;
        tokenTreasuryClaimable[currency][treasury] += treasuryAmount;
        uint256 allocated;
        uint256 lastPositive;
        for (uint256 i; i < route.recipients.length; ++i) if (route.recipients[i].baseBps > 0) lastPositive = i;
        for (uint256 i; i < route.recipients.length; ++i) {
            RouteRecipient storage recipient = route.recipients[i];
            uint256 share = i == lastPositive ? contributorAmount - allocated : contributorAmount * recipient.baseBps / BPS;
            allocated += share;
            tokenClaimable[assetId][currency][recipient.wallet] += share;
        }
        if (holderAmount > 0) {
            IERC20(currency).forceApprove(route.rewardBasket, holderAmount);
            IRevenueBasketRewards(route.rewardBasket).depositToken(currency, holderAmount);
            IERC20(currency).forceApprove(route.rewardBasket, 0);
        }
        emit TokenRevenueReceived(assetId, currency, msg.sender, amount, treasuryAmount, contributorAmount, holderAmount);
    }

    function claimToken(bytes32 assetId, address currency, address recipient) external nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        uint256 amount = tokenClaimable[assetId][currency][msg.sender];
        if (amount == 0) revert NothingToClaim();
        tokenClaimable[assetId][currency][msg.sender] = 0;
        IERC20(currency).safeTransfer(recipient, amount);
        emit TokenClaimed(assetId, currency, recipient, amount);
    }

    function claimTokenTreasury(address currency, address recipient) external nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        uint256 amount = tokenTreasuryClaimable[currency][msg.sender];
        if (amount == 0) revert NothingToClaim();
        tokenTreasuryClaimable[currency][msg.sender] = 0;
        IERC20(currency).safeTransfer(recipient, amount);
    }

    /// @notice Existing routes retain their originally agreed bonus destination.
    function setBasketRewards(address rewards) external onlyOwner {
        require(address(basketRewards) == address(0) && rewards.code.length > 0, "Invalid basket");
        require(IRevenueBasketRewards(rewards).stakingVault() == address(stakingVault), "Basket vault mismatch");
        basketRewards = IRevenueBasketRewards(rewards);
        emit BasketRewardsConfigured(rewards);
    }

    function claim(bytes32 assetId) external nonReentrant {
        uint256 amount = claimable[assetId][msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[assetId][msg.sender] = 0;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "Claim transfer failed");
        emit Claimed(assetId, msg.sender, amount);
    }

    function getRoute(bytes32 assetId) external view returns (
        address publisher,
        string memory metadataURI,
        bool active,
        uint256 createdAt,
        uint256 totalReceived,
        RouteRecipient[] memory recipients
    ) {
        Route storage route = routes[assetId];
        if (route.createdAt == 0) revert RouteNotFound(assetId);
        return (route.publisher, route.metadataURI, route.active, route.createdAt, route.totalReceived, route.recipients);
    }

    function setStakingVault(address newVault) external onlyOwner {
        require(address(basketRewards) == address(0), "Basket vault frozen");
        require(newVault != address(0), "Invalid vault");
        address old = address(stakingVault);
        stakingVault = IBonzaiStakingVault(newVault);
        emit StakingVaultUpdated(old, newVault);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setTreasuryBps(uint16 newBps) external onlyOwner {
        if (newBps > 3_000 || newBps + stakingRewardBps > 4_000) revert InvalidBps();
        uint16 old = treasuryBps;
        treasuryBps = newBps;
        emit TreasuryBpsUpdated(old, newBps);
    }

    function setStakingRewardBps(uint16 newBps) external onlyOwner {
        if (newBps > 3_000 || newBps + treasuryBps > 4_000) revert InvalidBps();
        uint16 old = stakingRewardBps;
        stakingRewardBps = newBps;
        emit StakingRewardBpsUpdated(old, newBps);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
