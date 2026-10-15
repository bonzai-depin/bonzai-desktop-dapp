// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockBonzaiContent
 * @notice Mock BonzaiContent NFT for testing FineTuneTokenFactory
 */
contract MockBonzaiContent is ERC721 {
    uint256 private _tokenIdCounter;

    constructor() ERC721("MockContent", "MCONT") {}

    // Clone initializer used by the real collection factory in publication tests.
    function initialize(address, string calldata, address, address) external {}

    function mintTo(address to) external returns (uint256) {
        _tokenIdCounter++;
        _mint(to, _tokenIdCounter);
        return _tokenIdCounter;
    }
}
