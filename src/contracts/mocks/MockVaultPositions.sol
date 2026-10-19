// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract MockVaultPositions is ERC721 {
    mapping(uint256=>uint256) public principal;
    mapping(uint256=>mapping(address=>uint256)) public fees;
    constructor() ERC721("Position","POS") {}
    function mint(address vault,uint256 id) external {_mint(vault,id);principal[id]=1000;}
    function fund(uint256 id,address currency,uint256 amount) external payable {
        if(currency==address(0))require(msg.value==amount);else require(IERC20(currency).transferFrom(msg.sender,address(this),amount));
        fees[id][currency]+=amount;
    }
    function modifyLiquidities(bytes calldata data,uint256 deadline) external payable {
        require(deadline>=block.timestamp);(bytes memory actions,bytes[] memory params)=abi.decode(data,(bytes,bytes[]));
        require(keccak256(actions)==keccak256(hex"0111")&&params.length==2,"Wrong collection actions");
        (uint256 id,uint256 liquidity,uint128 min0,uint128 min1,bytes memory hook)=abi.decode(params[0],(uint256,uint256,uint128,uint128,bytes));
        require(ownerOf(id)==msg.sender && liquidity==0 && min0==0 && min1==0 && hook.length==0,"Principal must remain locked");
        (address c0,address c1,address recipient)=abi.decode(params[1],(address,address,address));require(recipient==msg.sender,"Redirected fees");
        _pay(id,c0,recipient);_pay(id,c1,recipient);
    }
    function _pay(uint256 id,address currency,address recipient) private {
        uint256 amount=fees[id][currency];fees[id][currency]=0;if(amount==0)return;
        if(currency==address(0)){(bool ok,)=payable(recipient).call{value:amount}("");require(ok);}else require(IERC20(currency).transfer(recipient,amount));
    }
}
contract MockVaultAgents is ERC721 {
    mapping(uint256=>address) public getAgentWallet;
    constructor() ERC721("Agent","AGENT") {}
    function mint(address owner,address wallet) external {_mint(owner,1);getAgentWallet[1]=wallet;}
    function setWallet(address wallet) external {require(msg.sender==ownerOf(1));getAgentWallet[1]=wallet;}
}
