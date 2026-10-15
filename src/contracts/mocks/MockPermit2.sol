// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract MockPermit2 {
    struct Allowance { uint160 amount; uint48 expiration; }
    mapping(address => mapping(address => mapping(address => Allowance))) public allowance;
    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        allowance[msg.sender][token][spender] = Allowance(amount, expiration);
    }
    function transferFrom(address from, address to, uint160 amount, address token) external {
        Allowance storage a = allowance[from][token][msg.sender];
        require(a.expiration >= block.timestamp && a.amount >= amount, "Permit2 allowance");
        a.amount -= amount;
        require(IERC20(token).transferFrom(from, to, amount), "Transfer failed");
    }
}
