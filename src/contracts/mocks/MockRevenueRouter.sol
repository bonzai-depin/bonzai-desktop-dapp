// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockRevenueRouter {
    mapping(bytes32 => uint256) public received;

    function depositRevenue(bytes32 assetId) external payable {
        received[assetId] += msg.value;
    }
}
