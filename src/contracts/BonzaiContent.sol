// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBonzaiUnlock {
    function isUnlocked(address user) external view returns (bool);
}

/**
 * @title ITransferValidator
 * @notice Interface for Limit Break's Creator Token Transfer Validator (V2+)
 * @dev Deployed on Base, Ethereum, and all major chains. The validator enforces
 *      whitelisted-operator policies so only approved marketplaces (OpenSea Seaport,
 *      Magic Eden, etc.) can facilitate transfers.
 */
interface ITransferValidator {
    function validateTransfer(address caller, address from, address to, uint256 tokenId) external view;
}

/**
 * @title ICreatorToken
 * @notice Interface for ERC721-C Creator Token Standard
 * @dev Marketplaces (OpenSea, Magic Eden) check supportsInterface for this to
 *      detect on-chain royalty enforcement.
 */
interface ICreatorToken {
    event TransferValidatorUpdated(address oldValidator, address newValidator);
    function getTransferValidator() external view returns (address validator);
}

/**
 * @title IBonzaiMintPool
 * @notice Interface for the per-content-type revenue pool
 */
interface IBonzaiMintPool {
    function depositForPool(uint8 poolIndex) external payable;
}

/**
 * @title BonzaiContent
 * @notice ERC-721 NFT contract for AI-generated content on Base.
 *         Each token stores on-chain provenance linking to Irys/Arweave storage.
 *         Mint fees are split 80/20 between treasury and per-content-type pools.
 *         Implements ERC-2981 for 7.5% secondary sale royalties.
 *         Implements ERC721-C (Creator Token Standard) for on-chain royalty enforcement
 *         via Limit Break's Transfer Validator — only whitelisted operators (OpenSea
 *         Seaport, Magic Eden, etc.) can facilitate transfers.
 */
contract BonzaiContent is ERC721URIStorage, Ownable, ReentrancyGuard, IERC2981, ICreatorToken {
    uint256 private _tokenIdCounter;
    uint256 public mintFee = 0.0025 ether;
    address public treasury;
    address public mintPool;
    address public royaltySplitter;

    /// @notice Fee split in basis points (must sum to 10000)
    uint256 public treasuryBps = 8000;  // 80%
    uint256 public poolBps = 2000;      // 20%

    /// @notice Royalty percentage in basis points (7.5%)
    uint256 public royaltyBps = 750;

    /// @notice ERC721-C Transfer Validator address
    address private _transferValidator;

    IERC20 public bonzaiToken;
    address public unlockContract;
    uint256[6] public mintThresholds;

    struct Provenance {
        string transactionId;
        address originalCreator;
        string model;
        uint256 creationTimestamp;
        uint8 contentType;  // 0=text, 1=audio, 2=image, 3=video, 4=3D, 5=training
    }

    mapping(uint256 => Provenance) public provenance;

    event ContentMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string transactionId,
        string model,
        uint256 timestamp
    );

    event MintPoolUpdated(address indexed oldPool, address indexed newPool);
    event RoyaltySplitterUpdated(address indexed oldSplitter, address indexed newSplitter);
    event SplitBpsUpdated(uint256 treasuryBps, uint256 poolBps);
    event PoolDepositFailed(address indexed mintPool, uint8 contentType, uint256 amount);

    constructor(address _treasury) ERC721("BonzAI Collectibles", "BONZAI-C") Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        // Level thresholds initialized to zero (set via admin after deployment)
    }

    /**
     * @notice Mint AI-generated content as an NFT
     * @param transactionId Arweave transaction ID from Irys upload
     * @param model AI model identifier used for generation
     * @param tokenURI_ URI pointing to Irys metadata JSON
     * @param contentType_ Content type index (0=text, 1=audio, 2=image, 3=video, 4=3D, 5=training)
     */
    function mint(
        string calldata transactionId,
        string calldata model,
        string calldata tokenURI_,
        uint8 contentType_
    ) external payable nonReentrant returns (uint256) {
        require(msg.value >= mintFee, "Insufficient mint fee");
        require(contentType_ <= 5, "Invalid content type");
        require(_hasLevel(msg.sender, contentType_), "Insufficient level");

        // Split mintFee: treasuryBps% to treasury, poolBps% to content-type pool
        // All ETH transfers happen BEFORE _safeMint to prevent reentrancy
        // via onERC721Received callback.
        uint256 treasuryAmt = (mintFee * treasuryBps) / 10000;
        uint256 poolAmt = mintFee - treasuryAmt;

        // treasury is guaranteed != address(0) by constructor and setTreasury
        (bool s1, ) = treasury.call{value: treasuryAmt}("");
        require(s1, "Treasury transfer failed");

        if (mintPool != address(0) && poolAmt > 0) {
            try IBonzaiMintPool(mintPool).depositForPool{value: poolAmt}(contentType_) {
                // Pool deposit succeeded
            } catch {
                // Pool reverted — fallback to treasury so minting is never blocked
                emit PoolDepositFailed(mintPool, contentType_, poolAmt);
                (bool s2, ) = treasury.call{value: poolAmt}("");
                require(s2, "Fallback treasury transfer failed");
            }
        } else if (poolAmt > 0) {
            // Pool not configured — send pool share to treasury
            (bool s2, ) = treasury.call{value: poolAmt}("");
            require(s2, "Fallback treasury transfer failed");
        }

        // Refund excess ETH to minter
        uint256 excess = msg.value - mintFee;
        if (excess > 0) {
            (bool refunded, ) = msg.sender.call{value: excess}("");
            require(refunded, "ETH refund failed");
        }

        // Mint token AFTER all ETH transfers are complete
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        provenance[tokenId] = Provenance({
            transactionId: transactionId,
            originalCreator: msg.sender,
            model: model,
            creationTimestamp: block.timestamp,
            contentType: contentType_
        });

        emit ContentMinted(tokenId, msg.sender, transactionId, model, block.timestamp);

        return tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC-2981 ROYALTIES (7.5% total for secondary sales)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice ERC-2981 royalty info — 7.5% to royalty splitter (or treasury fallback)
     */
    function royaltyInfo(uint256, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        receiver = royaltySplitter != address(0) ? royaltySplitter : treasury;
        royaltyAmount = (salePrice * royaltyBps) / 10000;
    }

    /**
     * @dev ERC-165: support ERC-2981 + ICreatorToken (ERC721-C) interfaces
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IERC2981).interfaceId ||
            interfaceId == type(ICreatorToken).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ERC721-C CREATOR TOKEN TRANSFER VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get the current transfer validator address
     * @return validator The transfer validator contract address (address(0) if not set)
     */
    function getTransferValidator() external view override returns (address validator) {
        return _transferValidator;
    }

    /**
     * @notice Set the transfer validator (owner only)
     * @dev Set to address(0) to disable transfer validation (not recommended).
     *      On Base, use Limit Break's Transfer Validator V2 deployed address.
     * @param validator The transfer validator contract address
     */
    function setTransferValidator(address validator) external onlyOwner {
        address old = _transferValidator;
        _transferValidator = validator;
        emit TransferValidatorUpdated(old, validator);
    }

    /**
     * @dev Override ERC721 _update to enforce ERC721-C transfer validation.
     *      The Transfer Validator is called on every transfer to ensure only
     *      whitelisted operators can facilitate transfers. Mints (from == 0)
     *      and burns (to == 0) are NOT validated.
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);

        // ERC721-C: validate transfers (skip mints and burns)
        if (from != address(0) && to != address(0) && _transferValidator != address(0)) {
            ITransferValidator(_transferValidator).validateTransfer(msg.sender, from, to, tokenId);
        }

        return super._update(to, tokenId, auth);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get content type for a token
     */
    function getContentType(uint256 tokenId) external view returns (uint8) {
        require(provenance[tokenId].creationTimestamp != 0, "Token does not exist");
        return provenance[tokenId].contentType;
    }

    /**
     * @notice Get original creator for a token
     */
    function getCreator(uint256 tokenId) external view returns (address) {
        require(provenance[tokenId].creationTimestamp != 0, "Token does not exist");
        return provenance[tokenId].originalCreator;
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setMintFee(uint256 _fee) external onlyOwner {
        require(_fee > 0, "Fee cannot be zero");
        mintFee = _fee;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function setMintPool(address _pool) external onlyOwner {
        address old = mintPool;
        mintPool = _pool;
        emit MintPoolUpdated(old, _pool);
    }

    function setRoyaltySplitter(address _splitter) external onlyOwner {
        address old = royaltySplitter;
        royaltySplitter = _splitter;
        emit RoyaltySplitterUpdated(old, _splitter);
    }

    function setSplitBps(uint256 _treasuryBps, uint256 _poolBps) external onlyOwner {
        require(_treasuryBps + _poolBps == 10000, "Must sum to 100%");
        treasuryBps = _treasuryBps;
        poolBps = _poolBps;
        emit SplitBpsUpdated(_treasuryBps, _poolBps);
    }

    function setRoyaltyBps(uint256 _royaltyBps) external onlyOwner {
        require(_royaltyBps <= 1000, "Max 10%");
        royaltyBps = _royaltyBps;
    }

    /**
     * @notice Recover ERC20 tokens sent to contract by mistake
     */
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", owner(), amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    /**
     * @notice Recover any stuck ETH (e.g. if treasury/pool misconfigured)
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool sent, ) = owner().call{value: balance}("");
        require(sent, "ETH transfer failed");
    }

    function setBonzaiToken(address _token) external onlyOwner {
        bonzaiToken = IERC20(_token);
    }

    function setUnlockContract(address _unlock) external onlyOwner {
        unlockContract = _unlock;
    }

    function setMintThresholds(uint256[6] calldata _thresholds) external onlyOwner {
        mintThresholds = _thresholds;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function _hasLevel(address user, uint8 contentType) internal view returns (bool) {
        if (contentType >= 6) return false;
        if (unlockContract != address(0) && IBonzaiUnlock(unlockContract).isUnlocked(user)) {
            return true;
        }
        if (address(bonzaiToken) != address(0) && mintThresholds[contentType] > 0) {
            return bonzaiToken.balanceOf(user) >= mintThresholds[contentType];
        }
        // If no level check configured, allow minting (backward compatible)
        return true;
    }

    /// @notice Accept ETH transfers
    receive() external payable {}
}
