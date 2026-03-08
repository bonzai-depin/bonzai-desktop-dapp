// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ETHRejector
 * @notice Contract that always reverts when receiving ETH, for testing transfer failures
 */
contract ETHRejector {
    receive() external payable {
        revert("ETHRejector: rejected");
    }

    fallback() external payable {
        revert("ETHRejector: rejected");
    }
}
