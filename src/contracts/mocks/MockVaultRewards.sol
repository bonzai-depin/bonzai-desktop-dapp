// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract MockVaultRewards {
    mapping(address=>uint256) public deposited;
    bool public fail;
    function registerLiquidityCurrency(address) external {}
    function setFail(bool value) external {fail=value;}
    function depositNative() external payable { require(!fail,"Rewards unavailable");deposited[address(0)]+=msg.value; }
    function depositToken(address currency,uint256 amount) external {require(!fail,"Rewards unavailable");require(IERC20(currency).transferFrom(msg.sender,address(this),amount));deposited[currency]+=amount;}
}
