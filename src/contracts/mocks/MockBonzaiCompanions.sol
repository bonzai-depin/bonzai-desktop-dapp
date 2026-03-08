// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockBonzaiCompanions
 * @notice Mock BonzaiCompanions NFT for testing CompanionTokenFactory
 */
contract MockBonzaiCompanions is ERC721 {
    uint256 private _tokenIdCounter;

    constructor() ERC721("MockCompanions", "MCOMP") {}

    function mintTo(address to) external returns (uint256) {
        _tokenIdCounter++;
        _mint(to, _tokenIdCounter);
        return _tokenIdCounter;
    }
}
