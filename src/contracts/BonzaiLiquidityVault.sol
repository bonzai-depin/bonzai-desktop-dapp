// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IVaultPositions { function modifyLiquidities(bytes calldata data,uint256 deadline) external payable; }
interface IVaultAgent { function getAgentWallet(uint256 id) external view returns(address); }
interface IVaultRewards {
    function registerLiquidityCurrency(address currency) external;
    function depositNative() external payable;
    function depositToken(address currency,uint256 amount) external;
}
/// @notice Permanent position custody. No transfer, approval, upgrade, arbitrary-call or principal withdrawal path.
/// Fees are credited in their original currencies; collection never invokes a beneficiary.
contract BonzaiLiquidityVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint24 public constant TRADING_FEE = 10000; // Uniswap millionths: 1%.
    address public immutable factory;
    address public immutable positionManager;
    address public immutable treasury;
    address public immutable rewardPool;
    struct Position { address currency0; address currency1; address beneficiary; address agentCollection; uint256 agentId; bool registered; }
    mapping(uint256=>Position) public positions;
    struct Recipient { address wallet; uint16 bps; }
    mapping(uint256=>Recipient[]) private creatorRecipients;
    event CreatorRecipientsSet(uint256 indexed positionId,address[] wallets,uint16[] shares);
    mapping(address=>mapping(address=>uint256)) public claimable;
    mapping(address=>uint256) public pendingRewards;
    event PositionLocked(uint256 indexed positionId,address currency0,address currency1,address beneficiary,address agentCollection,uint256 agentId);
    event FeesCollected(uint256 indexed positionId,uint256 amount0,uint256 amount1);
    event FeesClaimed(address indexed currency,address indexed beneficiary,uint256 amount);
    event RewardsDeposited(address indexed currency,uint256 amount);
    constructor(address manager,address treasury_,address rewards_) {
        require(manager.code.length>0 && treasury_!=address(0) && rewards_.code.length>0,"Invalid vault configuration");
        factory=msg.sender;positionManager=manager;treasury=treasury_;rewardPool=rewards_;
    }
    function register(uint256 id,address c0,address c1,address beneficiary,address agents,uint256 agentId) external {
        require(msg.sender==factory,"Only factory");
        require(!positions[id].registered && c0<c1 && beneficiary!=address(0),"Invalid position");
        require(IERC721(positionManager).ownerOf(id)==address(this),"Position not locked");
        if(agents!=address(0)) { require(agents.code.length>0,"Invalid agents"); IERC721(agents).ownerOf(agentId); }
        positions[id]=Position(c0,c1,beneficiary,agents,agentId,true);
        IVaultRewards(rewardPool).registerLiquidityCurrency(c0);
        IVaultRewards(rewardPool).registerLiquidityCurrency(c1);
        emit PositionLocked(id,c0,c1,beneficiary,agents,agentId);
    }
    /// Original beneficiary may irrevocably divide future creator fees once. Existing credits are untouched.
    function setCreatorRecipients(uint256 id,address[] calldata wallets,uint16[] calldata shares) external {
        Position memory p=positions[id];
        require(p.registered && p.agentCollection==address(0) && msg.sender==p.beneficiary,"Only creator");
        require(creatorRecipients[id].length==0,"Recipients already configured");
        require(wallets.length>0 && wallets.length<=64 && wallets.length==shares.length,"Invalid recipients");
        uint256 total;
        for(uint256 i;i<wallets.length;i++) {
            require(wallets[i]!=address(0) && shares[i]>0,"Invalid recipient");
            for(uint256 j;j<i;j++)require(wallets[i]!=wallets[j],"Duplicate recipient");
            total+=shares[i];creatorRecipients[id].push(Recipient(wallets[i],shares[i]));
        }
        require(total==10000,"Shares must total 10000");emit CreatorRecipientsSet(id,wallets,shares);
    }
    function getCreatorRecipients(uint256 id) external view returns(Recipient[] memory) {return creatorRecipients[id];}
    function collect(uint256 id) external nonReentrant {
        Position memory p=positions[id];require(p.registered,"Unknown position");
        address wallet=p.beneficiary;address owner;
        if(p.agentCollection!=address(0)) {
            wallet=IVaultAgent(p.agentCollection).getAgentWallet(p.agentId);
            owner=IERC721(p.agentCollection).ownerOf(p.agentId);
            require(wallet!=address(0),"Missing agent wallet");
        }
        uint256 before0=_balance(p.currency0);uint256 before1=_balance(p.currency1);
        bytes[] memory params=new bytes[](2);
        // DECREASE_LIQUIDITY with ZERO principal, then TAKE_PAIR to this vault only.
        params[0]=abi.encode(id,uint256(0),uint128(0),uint128(0),bytes(""));
        params[1]=abi.encode(p.currency0,p.currency1,address(this));
        IVaultPositions(positionManager).modifyLiquidities(abi.encode(hex"0111",params),block.timestamp);
        uint256 amount0=_balance(p.currency0)-before0;uint256 amount1=_balance(p.currency1)-before1;
        _credit(id,p.currency0,amount0,wallet,owner);_credit(id,p.currency1,amount1,wallet,owner);
        emit FeesCollected(id,amount0,amount1);
    }
    function _credit(uint256 id,address currency,uint256 amount,address beneficiary,address owner) private {
        uint256 creatorShare=amount*70/100;uint256 treasuryShare=amount*20/100;
        if(owner==address(0)) {
            Recipient[] storage recipients=creatorRecipients[id];uint256 allocated;
            if(recipients.length==0)claimable[currency][beneficiary]+=creatorShare;
            for(uint256 i;i<recipients.length;i++) {
                uint256 share=i+1==recipients.length?creatorShare-allocated:creatorShare*recipients[i].bps/10000;
                allocated+=share;claimable[currency][recipients[i].wallet]+=share;
            }
        }
        else { uint256 walletShare=amount*35/100;claimable[currency][beneficiary]+=walletShare;claimable[currency][owner]+=creatorShare-walletShare; }
        claimable[currency][treasury]+=treasuryShare;
        pendingRewards[currency]+=amount-creatorShare-treasuryShare;
    }
    /// Anyone can deliver a credit, but never redirect it or change its historical beneficiary.
    function claim(address currency,address beneficiary) external nonReentrant {
        _claim(currency, beneficiary, beneficiary);
    }
    /// Only the earned beneficiary may select an alternate receiver.
    function claimTo(address currency,address recipient) external nonReentrant {
        require(recipient!=address(0),"Invalid recipient");
        _claim(currency,msg.sender,recipient);
    }
    function _claim(address currency,address beneficiary,address recipient) private {
        uint256 amount=claimable[currency][beneficiary];require(amount>0,"No fees");
        claimable[currency][beneficiary]=0;
        if(currency==address(0)) { (bool ok,)=payable(recipient).call{value:amount}("");require(ok,"Payment failed"); }
        else IERC20(currency).safeTransfer(recipient,amount);
        emit FeesClaimed(currency,beneficiary,amount);
    }
    /// Separate retryable accounting deposit: a disabled reward currency cannot block collection or creator claims.
    function flushRewards(address currency) external nonReentrant {
        uint256 amount=pendingRewards[currency];require(amount>0,"No rewards");pendingRewards[currency]=0;
        if(currency==address(0)) IVaultRewards(rewardPool).depositNative{value:amount}();
        else { IERC20(currency).forceApprove(rewardPool,amount);IVaultRewards(rewardPool).depositToken(currency,amount);IERC20(currency).forceApprove(rewardPool,0); }
        emit RewardsDeposited(currency,amount);
    }
    function _balance(address currency) private view returns(uint256) { return currency==address(0)?address(this).balance:IERC20(currency).balanceOf(address(this)); }
    receive() external payable {}
}
