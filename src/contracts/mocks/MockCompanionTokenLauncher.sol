// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockCompanionTokenLauncher {
    string public lastName;
    string public lastSymbol;
    uint256 public lastTokenId;
    uint256 public lastLiquidity;

    function launchToken(
        uint256 tokenId,
        string calldata name,
        string calldata symbol,
        string calldata,
        address,
        address
    ) external payable returns (address token, bytes32 poolId) {
        lastTokenId = tokenId;
        lastName = name;
        lastSymbol = symbol;
        lastLiquidity = msg.value;
        token = address(0x1234);
        poolId = keccak256(abi.encode(tokenId, name, symbol));
    }
}
