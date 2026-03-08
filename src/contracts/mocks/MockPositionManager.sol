// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockPositionManager
 * @notice Mock Uniswap V4 PositionManager for testing token factories
 */
contract MockPositionManager is ERC721 {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    uint256 private _nextTokenId = 1;

    constructor() ERC721("MockPosition", "MPOS") {}

    function mint(
        PoolKey calldata,
        int24,
        int24,
        uint256,
        uint128,
        uint128,
        address owner,
        bytes calldata
    ) external payable returns (uint256 tokenId, uint128 liquidity0, uint128 liquidity1) {
        tokenId = _nextTokenId++;
        _mint(owner, tokenId);
        return (tokenId, 0, 0);
    }

    receive() external payable {}
}
