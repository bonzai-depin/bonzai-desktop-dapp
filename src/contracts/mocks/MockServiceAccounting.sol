// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IProviderPool {
    function withdrawProviderShare(uint256 epoch, uint8 pool, address provider, uint256 ownTime, uint256 totalTime) external;
}
/// @dev Test-only stand-in for the immutable accounting contract, never a production attestor.
contract MockServiceAccounting {
    function withdraw(address target, uint256 epoch, uint8 pool, address provider, uint256 ownTime, uint256 totalTime) external {
        IProviderPool(target).withdrawProviderShare(epoch, pool, provider, ownTime, totalTime);
    }
}
