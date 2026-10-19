// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CompanionToken.sol";
import "./BonzaiLiquidityVault.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CompanionTokenFactory.sol";
interface INvdaReserveSwap {
    function nvda() external view returns(address);
    function swap(uint128 minOut,uint256 deadline) external payable returns(uint256);
}
/// @notice Immutable, hookless NVDA launch factory for BonzaiSmartAgents.
contract BonzaiAgentTokenFactory is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    uint256 public constant TOTAL_SUPPLY=1_000_000_000 ether;
    uint256 public constant POOL_SUPPLY=TOTAL_SUPPLY*96/100;
    address public constant BURN_ADDRESS=0x000000000000000000000000000000000000dEaD;
    BonzaiLiquidityVault public liquidityVault;
    mapping(address=>uint256) public liquidityPosition;
    address public immutable companionContract;
    IERC20 public immutable nvda;
    INvdaReserveSwap public immutable swapper;
    IPoolManagerCTF public immutable poolManager;
    IPositionManager public immutable positionManager;
    IPermit2 public immutable permit2;
    mapping(uint256=>address) public companionTokens;
    address[] public allTokens;
    event CompanionTokenLaunched(uint256 indexed id,address indexed token,bytes32 indexed poolId,uint256 nvdaPurchased,uint256 positionId);
    constructor(address agents,address quote,address swapAddress,address manager,address positions,address permits) Ownable(msg.sender){
        require(agents.code.length>0&&quote.code.length>0&&swapAddress.code.length>0&&manager.code.length>0&&positions.code.length>0&&permits.code.length>0,"Invalid deployment");
        require(INvdaReserveSwap(swapAddress).nvda()==quote,"Wrong quote token");
        companionContract=agents;nvda=IERC20(quote);swapper=INvdaReserveSwap(swapAddress);
        poolManager=IPoolManagerCTF(manager);positionManager=IPositionManager(positions);permit2=IPermit2(permits);
    }
    function configureLiquidityVault(address treasury,address rewards) external onlyOwner {
        require(address(liquidityVault)==address(0),"Vault already configured");
        liquidityVault=new BonzaiLiquidityVault(address(positionManager),treasury,rewards);
    }
    function launch(uint256 id,string calldata name,string calldata symbol,string calldata imageURI,address wallet,uint128 minOut,uint256 deadline)
        external payable nonReentrant returns(address token,bytes32 poolId){
        require(address(liquidityVault)!=address(0),"Vault not configured");
        require(msg.sender==companionContract,"Only slot contract");require(msg.value==1 ether,"Exact reserve required");
        require(id>0&&id<=10000&&companionTokens[id]==address(0),"Invalid or issued slot");
        require(wallet!=address(0)&&minOut>0&&deadline>=block.timestamp&&deadline<=block.timestamp+30 minutes,"Invalid launch bounds");
        IERC721(companionContract).ownerOf(id);
        uint256 quoteBefore=nvda.balanceOf(address(this));
        swapper.swap{value:msg.value}(minOut,deadline);
        uint256 quoteAmount=nvda.balanceOf(address(this))-quoteBefore;
        require(quoteAmount>=minOut&&quoteAmount<=type(uint128).max,"Invalid NVDA output");
        CompanionToken issued=new CompanionToken(name,symbol,TOTAL_SUPPLY,address(this),imageURI,wallet,id);
        token=address(issued);companionTokens[id]=token;allTokens.push(token);
        IERC20(token).safeTransfer(wallet,TOTAL_SUPPLY-POOL_SUPPLY);
        bool quoteFirst=address(nvda)<token;
        address c0=quoteFirst?address(nvda):token;address c1=quoteFirst?token:address(nvda);
        uint256 a0=quoteFirst?quoteAmount:POOL_SUPPLY;uint256 a1=quoteFirst?POOL_SUPPLY:quoteAmount;
        IPositionManager.PoolKey memory key=IPositionManager.PoolKey(c0,c1,10000,60,address(0));
        uint160 price=BonzaiV4Liquidity.sqrtPrice(a0,a1);
        poolManager.initialize(IPoolManagerCTF.PoolKey(c0,c1,10000,60,address(0)),price);
        _approve(c0,a0,deadline);_approve(c1,a1,deadline);
        uint256 positionId=positionManager.nextTokenId();bytes[] memory params=new bytes[](2);
        params[0]=abi.encode(key,int24(-887220),int24(887220),uint256(BonzaiV4Liquidity.liquidity(a0,a1,price)),uint128(a0),uint128(a1),address(liquidityVault),bytes(""));
        params[1]=abi.encode(c0,c1);
        positionManager.modifyLiquidities(abi.encode(hex"020d",params),deadline);
        liquidityPosition[token]=positionId;
        liquidityVault.register(positionId,c0,c1,wallet,companionContract,id);
        // Full-range tick/wei rounding can leave dust. Lock it, never pay it to an administrator.
        uint256 tokenDust=issued.balanceOf(address(this));if(tokenDust>0)IERC20(token).safeTransfer(BURN_ADDRESS,tokenDust);
        uint256 quoteDust=nvda.balanceOf(address(this))-quoteBefore;if(quoteDust>0)nvda.safeTransfer(BURN_ADDRESS,quoteDust);
        _approve(c0,0,0);_approve(c1,0,0);
        poolId=keccak256(abi.encode(key));emit CompanionTokenLaunched(id,token,poolId,quoteAmount,positionId);
    }
    function _approve(address token,uint256 amount,uint256 expiry) private {
        IERC20(token).forceApprove(address(permit2),amount);permit2.approve(token,address(positionManager),uint160(amount),uint48(expiry));
    }
    function getToken(uint256 id) external view returns(address){return companionTokens[id];}
    function hasToken(uint256 id) external view returns(bool){return companionTokens[id]!=address(0);}
    function totalTokensLaunched() external view returns(uint256){return allTokens.length;}
    function getAllTokens() external view returns(address[] memory){return allTokens;}
}
