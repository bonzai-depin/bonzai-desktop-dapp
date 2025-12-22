// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BonzAIInfinityRegistry
/// @notice Tiny on-chain registry for LVL∞ (lifetime unlock).
/// Users buy LVL∞ by paying `priceWei` ETH. Access is recorded in `hasInfinity`.
/// Collected ETH is forwarded to `treasury` for protocol revenue tracking (DefiLlama compatible).
contract BonzAIInfinityRegistry {
    // Minimal Ownable
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // Access registry
    mapping(address => bool) public hasInfinity;

    // Admin-configurable parameters
    address public treasury;
    uint256 public priceWei;

    // Analytics / adapter event
    event InfinityPurchased(
        address indexed buyer,
        uint256 amountWei,
        address indexed treasury,
        uint256 timestamp
    );

    event PriceUpdated(uint256 oldPriceWei, uint256 newPriceWei);
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event InfinityGranted(address indexed user);
    event InfinityRevoked(address indexed user);

    constructor(address treasury_, uint256 priceWei_) {
        require(treasury_ != address(0), "TREASURY_ZERO");
        owner = msg.sender;
        treasury = treasury_;
        priceWei = priceWei_;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OWNER_ZERO");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Admin sets LVL∞ price in wei (configurable)
    function setPriceWei(uint256 newPriceWei) external onlyOwner {
        emit PriceUpdated(priceWei, newPriceWei);
        priceWei = newPriceWei;
    }

    /// @notice Admin updates treasury
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "TREASURY_ZERO");
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Optional admin grant
    function grantInfinity(address user) external onlyOwner {
        require(user != address(0), "USER_ZERO");
        hasInfinity[user] = true;
        emit InfinityGranted(user);
    }

    /// @notice Optional admin revoke
    function revokeInfinity(address user) external onlyOwner {
        hasInfinity[user] = false;
        emit InfinityRevoked(user);
    }

    /// @notice Buy LVL∞ for msg.sender by paying ETH.
    /// @dev msg.value may be >= priceWei; excess refunded.
    function buyInfinity() external payable {
        uint256 price = priceWei;
        require(price > 0, "PRICE_ZERO");
        require(msg.value >= price, "INSUFFICIENT_ETH");

        hasInfinity[msg.sender] = true;

        (bool okTreasury, ) = payable(treasury).call{value: price}("");
        require(okTreasury, "TREASURY_TRANSFER_FAIL");

        uint256 excess = msg.value - price;
        if (excess > 0) {
            (bool okRefund, ) = payable(msg.sender).call{value: excess}("");
            require(okRefund, "REFUND_FAIL");
        }

        emit InfinityPurchased(msg.sender, price, treasury, block.timestamp);
    }

    receive() external payable {
        revert("USE_buyInfinity");
    }
}
