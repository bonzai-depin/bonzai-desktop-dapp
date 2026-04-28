// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title MockBonzaiCompanions
 * @notice Mock BonzaiCompanions NFT for testing CompanionTokenFactory
 */
contract MockBonzaiCompanions is ERC721 {
    uint256 private _tokenIdCounter;
    mapping(uint256 => address) private _agentWallets;

    constructor() ERC721("MockCompanions", "MCOMP") {}

    function mintTo(address to) external returns (uint256) {
        _tokenIdCounter++;
        _mint(to, _tokenIdCounter);
        _agentWallets[_tokenIdCounter] = to; // default agent = owner
        return _tokenIdCounter;
    }

    /// @notice Mirrors BonzaiCompanions.getAgentWallet so tests can verify
    ///         the hook's live-lookup fee routing.
    function getAgentWallet(uint256 tokenId) external view returns (address) {
        return _agentWallets[tokenId];
    }

    function setAgentWallet(uint256 tokenId, address wallet) external {
        _agentWallets[tokenId] = wallet;
    }
}
