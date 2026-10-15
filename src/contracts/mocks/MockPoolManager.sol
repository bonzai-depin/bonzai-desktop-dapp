// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPoolManager
 * @notice Mock Uniswap V4 PoolManager for testing BonzaiUniswapHook and factories
 */
contract MockPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    mapping(bytes32 => bool) public initializedPools;
    mapping(bytes32 => uint160) public initialSqrtPrice;

    event PoolInitialized(bytes32 indexed poolId, uint160 sqrtPriceX96);
    event TokensTaken(address currency, address to, uint256 amount);

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24) {
        bytes32 poolId = keccak256(abi.encode(key));
        require(!initializedPools[poolId], "Pool already initialized");
        initializedPools[poolId] = true;
        initialSqrtPrice[poolId] = sqrtPriceX96;
        emit PoolInitialized(poolId, sqrtPriceX96);
        return 0; // tick
    }

    function take(address currency, address to, uint256 amount) external {
        require(currency == address(0), "Mock supports native fees only");
        require(address(this).balance >= amount, "Insufficient PoolManager balance");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "MockPoolManager: ETH transfer failed");
        emit TokensTaken(currency, to, amount);
    }

    function settle() external payable returns (uint256) {
        return msg.value;
    }

    /**
     * @notice Helper to simulate V4 afterSwap callback on the hook
     * @dev Sends ETH to the hook first (simulating PoolManager.take), then calls afterSwap
     */
    function callAfterSwap(
        address hook,
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        int256 delta,
        bytes calldata hookData
    ) external payable returns (bytes4, int128) {
        uint256 balanceBefore = address(this).balance;
        // Call afterSwap on the hook (msg.sender will be this MockPoolManager)
        (bool ok, bytes memory result) = hook.call(
            abi.encodeWithSignature(
                "afterSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),int256,bytes)",
                sender,
                key,
                params,
                delta,
                hookData
            )
        );
        require(ok, "MockPoolManager: afterSwap failed");
        (bytes4 selector, int128 hookDelta) = abi.decode(result, (bytes4, int128));
        require(hookDelta >= 0 && balanceBefore - address(this).balance == uint256(uint128(hookDelta)), "Unsettled hook delta");
        return (selector, hookDelta);
    }

    receive() external payable {}
}
