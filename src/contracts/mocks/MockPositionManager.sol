// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
interface IMockPermit2Transfer {
    function transferFrom(address from, address to, uint160 amount, address token) external;
}
contract MockPositionManager is ERC721 {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    uint256 public nextTokenId = 1;
    address public permit2;
    uint256 public lastLiquidity;
    uint128 public lastAmount0Max;
    uint128 public lastAmount1Max;
    constructor() ERC721("MockPosition", "MPOS") {}
    function setPermit2(address value) external { permit2 = value; }
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable {
        require(deadline >= block.timestamp, "Expired");
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(keccak256(actions) == keccak256(hex"020d14") && params.length == 3, "Invalid V4 actions");
        (PoolKey memory key, int24 lower, int24 upper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, address recipient,) =
            abi.decode(params[0], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes));
        require(key.currency0 == address(0) && lower == -887220 && upper == 887220, "Invalid pool");
        require(liquidity > 0 && amount0Max == msg.value && amount1Max > 0, "Invalid liquidity budgets");
        (address currency0, address currency1) = abi.decode(params[1], (address, address));
        require(currency0 == key.currency0 && currency1 == key.currency1, "Invalid settlement");
        (address sweepCurrency,) = abi.decode(params[2], (address, address));
        require(sweepCurrency == address(0), "Invalid sweep");
        lastLiquidity = liquidity; lastAmount0Max = amount0Max; lastAmount1Max = amount1Max;
        IMockPermit2Transfer(permit2).transferFrom(msg.sender, address(this), amount1Max, key.currency1);
        _mint(recipient, nextTokenId++);
    }
    receive() external payable {}
}
