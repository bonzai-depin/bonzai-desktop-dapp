// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockRevenueRouter {
    struct Recipient { address wallet; uint16 baseBps; uint16 contributionScore; string role; }
    mapping(bytes32 => uint256) public received;
    mapping(bytes32 => Recipient[]) private recipients;
    mapping(bytes32 => address) private publishers;
    bool public rejectDeposits;

    function setRejectDeposits(bool reject) external { rejectDeposits = reject; }

    function setRoute(bytes32 id, address[] calldata wallets, uint16[] calldata shares) external {
        delete recipients[id];
        publishers[id] = msg.sender;
        for (uint256 i; i < wallets.length; ++i) recipients[id].push(Recipient(wallets[i], shares[i], 0, "test"));
    }

    function getRoute(bytes32 id) external view returns (address, string memory, bool, uint256, uint256, Recipient[] memory) {
        require(publishers[id] != address(0), "Unknown route");
        return (publishers[id], "test", true, 1, received[id], recipients[id]);
    }

    function depositRevenue(bytes32 assetId) external payable {
        require(!rejectDeposits, "Router unavailable");
        received[assetId] += msg.value;
    }
}
