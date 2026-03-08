// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPermit2
 * @notice Mock Permit2 contract for testing token factories
 */
contract MockPermit2 {
    function approve(address, address, uint160, uint48) external {
        // No-op for testing
    }
}
