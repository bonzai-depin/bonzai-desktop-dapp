// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Test-only helpers for the BonzaiRevenueRouter accounting-order and
// reentrancy tests. Not deployed to production networks.

struct RouteRecipientView {
    address wallet;
    uint16 baseBps;
    uint16 contributionScore;
    string role;
}

interface IRevenueRouterTest {
    function depositRevenue(bytes32 assetId) external payable;
    function claim(bytes32 assetId) external;
    function getRoute(bytes32 assetId) external view returns (
        address publisher,
        string memory metadataURI,
        bool active,
        uint256 createdAt,
        uint256 totalReceived,
        RouteRecipientView[] memory recipients
    );
    function routedRevenue(bytes32 assetId) external view returns (uint256);
    function claimable(bytes32 assetId, address account) external view returns (uint256);
}

/**
 * @notice Treasury that snapshots router accounting during the deposit value
 *         callback, proving all effects completed before the transfer.
 */
contract InspectionTreasury {
    IRevenueRouterTest public immutable router;
    bytes32 public assetId;
    address[] private _watchRecipients;

    bool public receivedDuringDeposit;
    uint256 public snapTotalReceived;
    uint256 public snapRoutedRevenue;
    mapping(address => uint256) public snapClaimable;

    constructor(address router_) {
        router = IRevenueRouterTest(router_);
    }

    function configure(bytes32 assetId_, address[] calldata recipients_) external {
        assetId = assetId_;
        _watchRecipients = recipients_;
        receivedDuringDeposit = false;
    }

    function watchRecipient(uint256 i) external view returns (address) {
        return _watchRecipients[i];
    }

    function watchCount() external view returns (uint256) {
        return _watchRecipients.length;
    }

    receive() external payable {
        receivedDuringDeposit = true;
        bytes32 id = assetId;
        (, , , , uint256 totalReceived, ) = router.getRoute(id);
        snapTotalReceived = totalReceived;
        snapRoutedRevenue = router.routedRevenue(id);
        for (uint256 i = 0; i < _watchRecipients.length; ) {
            snapClaimable[_watchRecipients[i]] = router.claimable(id, _watchRecipients[i]);
            unchecked { i++; }
        }
    }
}

/**
 * @notice Treasury that attempts to re-enter depositRevenue during the value
 *         callback. The reentrant call must be blocked; no double credit.
 */
contract ReentrantDepositor {
    IRevenueRouterTest public immutable router;
    bytes32 public assetId;
    uint256 public reenterValue;

    constructor(address router_) {
        router = IRevenueRouterTest(router_);
    }

    function attack(bytes32 assetId_, uint256 reenterValue_) external payable {
        assetId = assetId_;
        reenterValue = reenterValue_;
        router.depositRevenue{value: msg.value}(assetId);
    }

    receive() external payable {
        router.depositRevenue{value: reenterValue}(assetId);
    }
}

/**
 * @notice Recipient that attempts to re-enter claim during its payout callback.
 */
contract ReentrantClaimer {
    IRevenueRouterTest public immutable router;
    bytes32 public assetId;

    constructor(address router_) {
        router = IRevenueRouterTest(router_);
    }

    function setAsset(bytes32 id) external {
        assetId = id;
    }

    function claim() external {
        router.claim(assetId);
    }

    receive() external payable {
        router.claim(assetId);
    }
}
