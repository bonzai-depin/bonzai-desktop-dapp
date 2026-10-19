// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./MockPermit2.sol";
import "../BonzaiSmartAgents.sol";
contract MockCappedSmartAgents is BonzaiSmartAgents {
    constructor(address proceeds) BonzaiSmartAgents(proceeds,"ipfs://slot") {}
    function seedLifetimeSupply(uint256 value) external { totalSupply=value; }
}
contract MockAgentMintReceiver {
    BonzaiSmartAgents public agents;
    bool public personalizedDuringMint;
    function mint(address collection) external payable {
        agents=BonzaiSmartAgents(payable(collection));agents.mintSlots{value:msg.value}(1);
    }
    function onERC721Received(address,address,uint256 id,bytes calldata) external returns(bytes4) {
        try agents.personalize(id,"ipfs://changed","Rose","ROSE","ipfs://image",address(this)) {
            personalizedDuringMint=true;
        } catch {}
        return this.onERC721Received.selector;
    }
}
contract MockNvda is ERC20 {
    constructor() ERC20("NVDA","NVDA"){}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
    function decimals() public pure override returns(uint8){return 6;}
}
contract MockNvdaSwap {
    address public immutable nvda;uint256 public output=25_000_000;bool public fail;
    constructor(address token){nvda=token;}
    function setOutput(uint256 amount) external{output=amount;}
    function setFail(bool value) external{fail=value;}
    function swap(uint128 minOut,uint256 deadline) external payable returns(uint256){
        require(!fail,"Swap failed");require(msg.value==1 ether&&output>=minOut&&deadline>=block.timestamp,"Swap bounds");MockNvda(nvda).mint(msg.sender,output);return output;
    }
}
contract MockAgentPositionManager is ERC721 {
    struct PoolKey{address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
    MockPermit2 public immutable permit2;uint256 public nextTokenId=1;bool public fail;bool public wrongRecipient;bool public leaveDust;
    address public currency0;address public currency1;uint128 public amount0;uint128 public amount1;
    constructor(address permits) ERC721("Position","POS"){permit2=MockPermit2(permits);}
    function setFail(bool value) external{fail=value;}
    function setWrongRecipient(bool value) external{wrongRecipient=value;}
    function setLeaveDust(bool value) external{leaveDust=value;}
    function modifyLiquidities(bytes calldata data,uint256 deadline) external payable {
        require(!fail,"LP failed");require(msg.value==0&&deadline>=block.timestamp,"Invalid payment");
        (bytes memory actions,bytes[] memory params)=abi.decode(data,(bytes,bytes[]));
        require(keccak256(actions)==keccak256(hex"020d")&&params.length==2,"Invalid actions");
        (PoolKey memory key,int24 lower,int24 upper,uint256 liquidity,uint128 a0,uint128 a1,address recipient,)=abi.decode(params[0],(PoolKey,int24,int24,uint256,uint128,uint128,address,bytes));
        require(key.currency0<key.currency1&&key.currency0!=address(0)&&key.fee==10000&&key.hooks==address(0),"Not hookless token pair");
        require(lower==-887220&&upper==887220&&liquidity>0,"Invalid position");
        (address c0,address c1)=abi.decode(params[1],(address,address));require(c0==key.currency0&&c1==key.currency1,"Settlement mismatch");
        currency0=c0;currency1=c1;amount0=a0;amount1=a1;
        permit2.transferFrom(msg.sender,address(this),leaveDust?a0-1:a0,c0);permit2.transferFrom(msg.sender,address(this),leaveDust?a1-1:a1,c1);
        _mint(wrongRecipient?msg.sender:recipient,nextTokenId++);
    }
}
contract MockAgentRouter {
    struct PoolKey{address currency0;address currency1;uint24 fee;int24 tickSpacing;address hooks;}
    struct ExactInputSingleParams{PoolKey poolKey;bool zeroForOne;uint128 amountIn;uint128 amountOutMinimum;bytes hookData;}
    function execute(bytes calldata commands,bytes[] calldata inputs,uint256 deadline) external payable {
        require(keccak256(commands)==keccak256(hex"10")&&inputs.length==1&&deadline>=block.timestamp,"Router command");
        (bytes memory actions,bytes[] memory params)=abi.decode(inputs[0],(bytes,bytes[]));require(keccak256(actions)==keccak256(hex"060c0f"),"Actions");
        ExactInputSingleParams memory swap=abi.decode(params[0],(ExactInputSingleParams));
        require(swap.poolKey.currency0==address(0)&&swap.zeroForOne&&swap.amountIn==msg.value&&msg.value==1 ether,"Swap encoding");
        (address settle,uint256 amount)=abi.decode(params[1],(address,uint256));require(settle==address(0)&&amount==msg.value,"Settle encoding");
        (address take,uint256 minOut)=abi.decode(params[2],(address,uint256));require(take==swap.poolKey.currency1&&minOut==swap.amountOutMinimum,"Take encoding");
        MockNvda(take).mint(msg.sender,25_000_000);
    }
}
