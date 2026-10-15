// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentReserveLauncher {
    function companionContract() external view returns(address);
    function launch(uint256 id, string calldata name, string calldata symbol, string calldata imageURI,
        address agentWallet, uint128 minNvdaOut, uint256 deadline) external payable returns(address,bytes32);
}

/// @notice New deployment: paid slots, owner-approved generated metadata, then optional token issuance.
/// @dev Never deploy in place of an existing collection without an explicit migration.
contract BonzaiSmartAgents is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MAX_PER_WALLET = 3;
    uint256 public constant MINT_PRICE = 2 ether;
    uint256 public constant LP_RESERVE = 1 ether;
    uint256 public totalSupply;
    uint256 public totalReservedETH;
    uint64 public mintStart;
    uint64 public mintEnd;
    address public immutable proceedsRecipient;
    address public launcher;
    string public placeholderURI;
    mapping(address=>uint256) public mintedBy;
    mapping(uint256=>uint256) public reserveOf;
    mapping(uint256=>address) public socialToken;
    // Every ownership or execution-wallet change invalidates offchain grants.
    mapping(uint256=>uint256) public controlEpoch;
    struct Identity { string name; string symbol; string imageURI; address wallet; bool ready; }
    mapping(uint256=>Identity) private identities;
    event SlotMinted(uint256 indexed id,address indexed minter,uint256 reserve);
    event AgentPersonalized(uint256 indexed id,string uri,address wallet);
    event TokenIssued(uint256 indexed id,address indexed token,bytes32 poolId);
    event DropScheduled(uint64 start,uint64 end);
    event ExecutionWalletChanged(uint256 indexed id,address wallet,uint256 epoch);

    constructor(address proceeds,string memory placeholder) ERC721("BonzAI Smart Agents","BONZAIAGENT") Ownable(msg.sender) {
        require(proceeds!=address(0)&&bytes(placeholder).length>0,"Invalid configuration");
        proceedsRecipient=proceeds;placeholderURI=placeholder;
    }
    function setLauncher(address value) external onlyOwner {
        require(launcher==address(0)&&value.code.length>0,"Launcher already set or invalid");
        require(IAgentReserveLauncher(value).companionContract()==address(this),"Wrong collection binding");
        launcher=value;
    }
    function scheduleDrop(uint64 start,uint64 end) external onlyOwner {
        require(totalSupply==0&&(mintStart==0||block.timestamp<mintStart),"Drop already started");
        require(start>=block.timestamp&&end>start,"Invalid schedule");mintStart=start;mintEnd=end;emit DropScheduled(start,end);
    }
    function mintSlots(uint256 quantity) external payable nonReentrant {
        require(launcher!=address(0),"Launcher not configured");
        require(mintStart!=0&&block.timestamp>=mintStart&&block.timestamp<mintEnd,"Drop not active");
        require(quantity>0&&mintedBy[msg.sender]+quantity<=MAX_PER_WALLET,"Wallet mint limit");
        require(totalSupply+quantity<=MAX_SUPPLY,"Supply cap");
        require(msg.value==quantity*MINT_PRICE,"Exact mint price required");
        mintedBy[msg.sender]+=quantity;uint256 first=totalSupply+1;totalSupply+=quantity;
        totalReservedETH+=quantity*LP_RESERVE;
        for(uint256 id=first;id<first+quantity;id++){
            reserveOf[id]=LP_RESERVE;_safeMint(msg.sender,id);_setTokenURI(id,placeholderURI);
            emit SlotMinted(id,msg.sender,LP_RESERVE);
        }
        // Proceeds accrue independently. No external payout can block the mint.
    }
    function personalize(uint256 id,string calldata uri,string calldata name,string calldata symbol,string calldata imageURI,address wallet) external nonReentrant {
        require(ownerOf(id)==msg.sender,"Not owner");require(socialToken[id]==address(0),"Identity locked after issuance");
        require(bytes(uri).length>0&&bytes(imageURI).length>0&&bytes(name).length>0&&bytes(name).length<=96,"Invalid metadata");
        require(bytes(symbol).length>0&&bytes(symbol).length<=12&&wallet!=address(0),"Invalid token identity");
        ++controlEpoch[id];identities[id]=Identity(name,symbol,imageURI,wallet,true);_setTokenURI(id,uri);emit AgentPersonalized(id,uri,wallet);
    }
    function getAgentWallet(uint256 id) external view returns(address){ownerOf(id);return identities[id].wallet;}
    function setExecutionWallet(uint256 id,address wallet) external {
        require(ownerOf(id)==msg.sender,"Not owner");
        require(wallet!=address(0),"Invalid wallet");
        identities[id].wallet=wallet;
        emit ExecutionWalletChanged(id,wallet,++controlEpoch[id]);
    }
    function revokeExecutionGrants(uint256 id) external {
        require(ownerOf(id)==msg.sender,"Not owner");
        emit ExecutionWalletChanged(id,identities[id].wallet,++controlEpoch[id]);
    }
    function _update(address to,uint256 id,address auth) internal override returns(address from) {
        from=super._update(to,id,auth);
        if(from!=address(0)) {
            // No private keys, operator permissions or future revenue follow the seller.
            // Already funded jobs retain their escrow-snapshotted worker and proceeds.
            identities[id].wallet=address(0);
            emit ExecutionWalletChanged(id,address(0),++controlEpoch[id]);
        }
    }
    function getIdentity(uint256 id) external view returns(Identity memory){ownerOf(id);return identities[id];}
    function getAgentURI(uint256 id) external view returns(string memory){return tokenURI(id);}
    function getOwnerCompanions(address account) external view returns(uint256[] memory ids) {
        ids = new uint256[](balanceOf(account));
        uint256 found;
        for (uint256 id = 1; id <= totalSupply && found < ids.length; id++) {
            if (_ownerOf(id) == account) ids[found++] = id;
        }
    }
    function issueToken(uint256 id,uint128 minNvdaOut,uint256 deadline) external nonReentrant returns(address token,bytes32 poolId){
        require(ownerOf(id)==msg.sender,"Not owner");Identity storage identity=identities[id];
        require(identity.ready,"Personalize first");require(socialToken[id]==address(0)&&reserveOf[id]==LP_RESERVE,"Already issued");
        require(identity.wallet!=address(0),"Set execution wallet after transfer");
        require(minNvdaOut>0&&deadline>=block.timestamp&&deadline<=block.timestamp+30 minutes,"Invalid execution bounds");
        reserveOf[id]=0;totalReservedETH-=LP_RESERVE;
        (token,poolId)=IAgentReserveLauncher(launcher).launch{value:LP_RESERVE}(id,identity.name,identity.symbol,identity.imageURI,identity.wallet,minNvdaOut,deadline);
        require(token.code.length>0,"Invalid issued token");socialToken[id]=token;emit TokenIssued(id,token,poolId);
    }
    function withdrawProceeds() external nonReentrant {
        uint256 amount=address(this).balance-totalReservedETH;require(amount>0,"No proceeds");
        (bool ok,)=proceedsRecipient.call{value:amount}("");require(ok,"Payout failed");
    }
    // Unissued reserves stay with the NFT; transfer does not replenish mintedBy.
    receive() external payable {}
}
