// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Native ETH is currency0; the issued token is currency1.
/// @dev PositionManager actions follow Uniswap v4-periphery Actions.sol:
/// MINT_POSITION=0x02, SETTLE_PAIR=0x0d, SWEEP=0x14.
library BonzaiV4Liquidity {
    uint256 internal constant Q96 = 1 << 96;

    function sqrtPrice(uint256 ethAmount, uint256 tokenAmount) internal pure returns (uint160) {
        require(ethAmount > 0 && ethAmount <= type(uint128).max && tokenAmount > 0, "Invalid liquidity amounts");
        // sqrt(currency1/currency0), with 64 fractional bits before Q96 scaling.
        uint256 price = Math.sqrt(Math.mulDiv(tokenAmount, 1 << 128, ethAmount)) << 32;
        require(price > 4295128739 && price < 1461446703485210103287273052203988822378723970342, "Invalid sqrt price");
        return uint160(price);
    }

    function liquidity(uint256 ethAmount, uint256 tokenAmount, uint160 price) internal pure returns (uint128) {
        // The infinite-range amount is a conservative lower bound for the
        // finite full-range ticks. Both input budgets therefore remain respected.
        uint256 amount = Math.min(Math.mulDiv(ethAmount, price, Q96), Math.mulDiv(tokenAmount, Q96, price));
        require(amount > 0 && amount <= type(uint128).max, "Invalid liquidity");
        return uint128(amount);
    }
}
