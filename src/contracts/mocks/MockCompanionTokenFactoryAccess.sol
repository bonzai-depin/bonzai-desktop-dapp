// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockCompanionTokenFactoryAccess {
    mapping(uint256 => address) public companionTokens;

    function setCompanionToken(uint256 companionTokenId, address token) external {
        companionTokens[companionTokenId] = token;
    }
}
