// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IReceiver} from "../cre/IReceiver.sol";

/**
 * @title MockFunctionsRouter
 * @notice Mock Chainlink CRE Forwarder for testing BonzaiMintPool.
 *         Simulates the forwarder calling onReport() on the consumer contract.
 *         Named MockFunctionsRouter for backward compatibility with deploy helpers.
 */
contract MockFunctionsRouter {
    /// @notice Simulate a CRE forwarder delivering a report to a consumer
    /// @param consumer The IReceiver contract to call
    /// @param report The ABI-encoded report data
    function deliverReport(address consumer, bytes calldata report) external {
        // Empty metadata (no workflow validation in tests)
        bytes memory metadata = new bytes(62); // 32 + 10 + 20 = 62 bytes
        IReceiver(consumer).onReport(metadata, report);
    }
}
