// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPaymentEscrow { function withdrawPayments(address payable recipient) external; }

/// @notice Contract wallet used to exercise rejecting and reentrant recipients.
contract MockEscrowParticipant {
    bool public rejectEther;
    address public escrow;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    function setRejectEther(bool reject) external { rejectEther = reject; }
    function setEscrow(address target) external { escrow = target; }
    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: msg.value}(data);
        require(success, "Participant call failed");
        return result;
    }
    receive() external payable {
        require(!rejectEther, "Reject payment");
        if (escrow != address(0)) {
            ++reentryAttempts;
            (reentrySucceeded,) = escrow.call(abi.encodeCall(IPaymentEscrow.withdrawPayments, (payable(address(this)))));
        }
    }
}
