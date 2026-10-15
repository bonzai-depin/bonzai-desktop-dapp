// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSocialTokenFactory {
    address public companionContract;
    mapping(uint256 => address) public getToken;
    constructor(address agents) { companionContract = agents; }
    function setToken(uint256 id, address token) external { getToken[id] = token; }
    function setCompanionContract(address agents) external { companionContract = agents; }
}

contract MockSettlementToken is ERC20 {
    uint8 private immutable tokenDecimals;
    bool public chargeFee;
    constructor(uint8 decimals_) ERC20("Settlement", "SET") { tokenDecimals = decimals_; }
    function decimals() public view override returns (uint8) { return tokenDecimals; }
    function mint(address wallet, uint256 amount) external { _mint(wallet, amount); }
    function setChargeFee(bool enabled) external { chargeFee = enabled; }
    function _update(address from, address to, uint256 amount) internal override {
        if (chargeFee && from != address(0) && to != address(0) && amount > 0) {
            super._update(from, address(0), 1);
            amount -= 1;
        }
        super._update(from, to, amount);
    }
}
