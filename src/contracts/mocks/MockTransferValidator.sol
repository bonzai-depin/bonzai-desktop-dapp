// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockTransferValidator
 * @notice Mock ERC721-C Transfer Validator for testing BonzaiContent
 */
contract MockTransferValidator {
    bool public shouldRevert;

    function setRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function validateTransfer(address, address, address, uint256) external view {
        if (shouldRevert) {
            revert("Transfer not allowed");
        }
    }
}
