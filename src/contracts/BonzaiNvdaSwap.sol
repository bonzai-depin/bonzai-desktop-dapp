// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IAgentUniversalRouter { function execute(bytes calldata commands,bytes[] calldata inputs,uint256 deadline) external payable; }
/// @notice Fixed-route, exact-input conversion. No caller-supplied router calldata or recipient.
/// @dev Requires a verified liquid native ETH/NVDA V4 route at deployment.
contract BonzaiNvdaSwap is ReentrancyGuard {
    using SafeERC20 for IERC20;
    struct PoolKey {address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
    struct ExactInputSingleParams {PoolKey poolKey;bool zeroForOne;uint128 amountIn;uint128 amountOutMinimum;bytes hookData;}
    address public immutable nvda;
    IAgentUniversalRouter public immutable router;
    uint24 public immutable routeFee;
    int24 public immutable routeTickSpacing;
    constructor(address quote,address routerAddress,uint24 fee,int24 spacing){
        require(quote.code.length>0&&routerAddress.code.length>0&&fee<=1_000_000&&spacing>0&&spacing<=32767,"Invalid route");
        nvda=quote;router=IAgentUniversalRouter(routerAddress);routeFee=fee;routeTickSpacing=spacing;
    }
    function swap(uint128 minOut,uint256 deadline) external payable nonReentrant returns(uint256 received){
        require(msg.value==1 ether&&minOut>0&&deadline>=block.timestamp&&deadline<=block.timestamp+30 minutes,"Invalid swap bounds");
        uint256 beforeBalance=IERC20(nvda).balanceOf(address(this));
        PoolKey memory key=PoolKey(address(0),nvda,routeFee,routeTickSpacing,address(0));
        bytes[] memory actions=new bytes[](3);
        actions[0]=abi.encode(ExactInputSingleParams(key,true,uint128(msg.value),minOut,bytes("")));
        actions[1]=abi.encode(address(0),msg.value);actions[2]=abi.encode(nvda,uint256(minOut));
        bytes[] memory inputs=new bytes[](1);inputs[0]=abi.encode(hex"060c0f",actions);
        router.execute{value:msg.value}(hex"10",inputs,deadline);
        received=IERC20(nvda).balanceOf(address(this))-beforeBalance;
        require(received>=minOut,"NVDA slippage");IERC20(nvda).safeTransfer(msg.sender,received);
    }
}
