// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IBonzaiStakingVault {
    function utilityWeight(address wallet) external view returns (uint256);
}

/**
 * @title BonzaiRevenueRouter
 * @notice Preserves immutable contribution royalties while distributing a
 * separate staking bonus to active contributors.
 */
contract BonzaiRevenueRouter is Ownable, ReentrancyGuard, Pausable {
    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_ROUTE_RECIPIENTS = 64;
    IBonzaiStakingVault public stakingVault;
    address public treasury;
    uint16 public treasuryBps = 1_000;
    uint16 public stakingRewardBps = 1_000;

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
        RouteRecipient[] recipients;
    }

    mapping(bytes32 => Route) private routes;
    mapping(bytes32 => mapping(address => uint256)) public claimable;
    mapping(bytes32 => uint256) public routedRevenue;

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
        bytes32 assetId,
        string calldata metadataURI,
        address[] calldata wallets,
        uint16[] calldata baseBps,
        uint16[] calldata contributionScores,
        string[] calldata roles
    ) external whenNotPaused {
        if (wallets.length == 0) revert EmptyRoute();
        if (wallets.length > MAX_ROUTE_RECIPIENTS) revert TooManyRecipients(wallets.length);
        if (wallets.length != baseBps.length || wallets.length != contributionScores.length || wallets.length != roles.length) {
            revert InvalidRecipient();
        }

        Route storage route = routes[assetId];
        if (route.createdAt != 0 && route.publisher != msg.sender) revert RouteAlreadyOwned(assetId);
        if (route.totalReceived != 0) revert RouteLocked(assetId);

        uint256 totalBps = 0;
        delete route.recipients;
        route.publisher = msg.sender;
        route.metadataURI = metadataURI;
        route.active = true;
        if (route.createdAt == 0) {
            route.createdAt = block.timestamp;
        }

        for (uint256 i = 0; i < wallets.length; ) {
            if (wallets[i] == address(0)) revert InvalidRecipient();
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

    function depositRevenue(bytes32 assetId) external payable nonReentrant whenNotPaused {
        Route storage route = routes[assetId];
        if (!route.active) revert RouteNotFound(assetId);
        require(msg.value > 0, "No revenue");

        uint256 treasuryAmount = msg.value * treasuryBps / BPS;
        uint256 stakingRewardAmount = msg.value * stakingRewardBps / BPS;
        uint256 contributorAmount = msg.value - treasuryAmount - stakingRewardAmount;

        // Effects: apply every accounting update before the first external value
        // transfer (checks-effects-interactions). Weight reads below are view-only
        // calls to the trusted vault and do not move value.
        route.totalReceived += msg.value;
        routedRevenue[assetId] += contributorAmount;

        uint256 lastRecipient = route.recipients.length - 1;
        uint256 allocated = 0;
        for (uint256 i = 0; i < route.recipients.length; ) {
            RouteRecipient storage recipient = route.recipients[i];
            uint256 share = i == lastRecipient
                ? contributorAmount - allocated
                : contributorAmount * recipient.baseBps / BPS;
            allocated += share;
            claimable[assetId][recipient.wallet] += share;
            unchecked { i++; }
        }

        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](route.recipients.length);
        for (uint256 i = 0; i < route.recipients.length; ) {
            RouteRecipient storage recipient = route.recipients[i];
            uint256 stakeWeight = stakingVault.utilityWeight(recipient.wallet);
            uint256 weight = stakeWeight * (BPS + recipient.contributionScore) / BPS;
            weights[i] = weight;
            totalWeight += weight;
            unchecked { i++; }
        }

        // All treasury-bound value (its share plus any unallocatable staking bonus
        // when total weight is zero) is settled in a single post-effects transfer.
        uint256 treasuryTransfer = treasuryAmount;
        if (totalWeight == 0) {
            treasuryTransfer += stakingRewardAmount;
        } else {
            uint256 bonusAllocated = 0;
            for (uint256 i = 0; i < route.recipients.length; ) {
                uint256 bonus = i == lastRecipient
                    ? stakingRewardAmount - bonusAllocated
                    : stakingRewardAmount * weights[i] / totalWeight;
                bonusAllocated += bonus;
                claimable[assetId][route.recipients[i].wallet] += bonus;
                unchecked { i++; }
            }
        }

        // Interactions: the only external value transfer, after every effect.
        // A failed transfer reverts the transaction, restoring all balances.
        (bool sentTreasury, ) = treasury.call{value: treasuryTransfer}("");
        require(sentTreasury, "Treasury transfer failed");

        emit RevenueReceived(assetId, msg.sender, msg.value, treasuryAmount, contributorAmount, stakingRewardAmount);
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
