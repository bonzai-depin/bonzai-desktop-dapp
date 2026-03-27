// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BonzaiSkillRegistry
 * @author BonzAI Team
 * @notice On-chain registry for decentralized AI skills (packaged prompts + tools)
 * @dev Deployed on Base. Handles skill registration, purchases, and execution fees.
 *
 * Skills are defined off-chain (IPFS/Arweave) and referenced by hash. This contract manages:
 * - Skill registration with author address and pricing
 * - One-time skill purchases (USDC payment)
 * - Per-execution running fees (USDC)
 * - Revenue split: 80% to co-owners (via BonzaiSkillOwnership), 20% to skill author
 *
 * Works with both BonzAI desktop app and Claude Code CLI (via MCP server).
 */
/**
 * @title IBonzaiSkillOwnership
 * @notice Interface for the skill co-ownership revenue distribution contract
 */
interface IBonzaiSkillOwnership {
    function distributeRevenue(bytes32 skillId, uint256 amount) external payable;
    function distributeRevenueUSDC(bytes32 skillId, uint256 amount) external;
}

contract BonzaiSkillRegistry is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Basis points for percentage calculations (100% = 10000)
    uint256 private constant BASIS_POINTS = 10000;

    /// @notice Co-owner share in basis points (80% = 8000)
    uint256 private constant CO_OWNER_SHARE_BPS = 8000;

    /// @notice Author share in basis points (20% = 2000)
    uint256 private constant AUTHOR_SHARE_BPS = 2000;

    /// @notice Maximum skills per author (spam prevention)
    uint256 public constant MAX_SKILLS_PER_AUTHOR = 100;

    /// @notice Maximum running fee in USDC (6 decimals)
    uint256 public constant MAX_RUNNING_FEE = 1000 * 1e6; // 1,000 USDC

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Skill metadata stored on-chain
    struct Skill {
        bytes32 id;                  // Keccak256 hash of name+version
        address author;              // Creator's wallet
        string name;                 // Skill name
        string version;              // Semantic version
        string category;             // Skill category
        string ipfsHash;             // IPFS/Arweave hash of full definition
        uint256 purchasePrice;       // One-time purchase price in USDC (6 decimals)
        uint256 runningFee;          // Per-execution fee in USDC (6 decimals)
        bool isActive;               // Can be purchased/executed
        bool isVerified;             // Verified by BonzAI team
        uint256 totalPurchases;      // Total number of purchases
        uint256 totalExecutions;     // Total number of executions
        uint256 totalRevenue;        // Total ETH revenue collected
        uint256 createdAt;           // Registration timestamp
        uint256 updatedAt;           // Last update timestamp
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice BONZAI token contract for running fees
    IERC20 public bonzaiToken;

    /// @notice USDC token contract for skill purchases
    IERC20 public usdcToken;

    /// @notice Platform treasury for fee collection
    address public treasury;

    /// @notice Skill ownership contract
    address public skillOwnershipContract;

    /// @notice Mapping of skill ID => Skill data
    mapping(bytes32 => Skill) public skills;

    /// @notice Mapping of user => skill ID => purchased
    mapping(address => mapping(bytes32 => bool)) public hasPurchased;

    /// @notice Mapping of author => skill IDs
    mapping(address => bytes32[]) public authorSkills;

    /// @notice Array of all skill IDs (for enumeration)
    bytes32[] public allSkillIds;

    /// @notice Valid spending profile category names (matching BonzaiCompanions.sol 12 categories)
    mapping(string => bool) public validCategories;

    /// @notice Total USDC collected as author share across all purchases
    uint256 public totalAuthorFeesUSDC;

    /// @notice Total USDC collected as author share from running fees
    uint256 public totalAuthorRunningFeesUSDC;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new skill is registered
    event SkillRegistered(
        bytes32 indexed skillId,
        address indexed author,
        string name,
        string version,
        string category,
        string ipfsHash,
        uint256 purchasePrice,
        uint256 runningFee,
        uint256 timestamp
    );

    /// @notice Emitted when a skill is updated
    event SkillUpdated(
        bytes32 indexed skillId,
        string ipfsHash,
        uint256 purchasePrice,
        uint256 runningFee,
        uint256 timestamp
    );

    /// @notice Emitted when a skill is purchased
    event SkillPurchased(
        bytes32 indexed skillId,
        address indexed buyer,
        address indexed author,
        uint256 price,
        uint256 coOwnerShare,
        uint256 platformShare,
        address paymentToken,
        uint256 timestamp
    );

    /// @notice Emitted when a skill execution fee is paid
    event SkillExecuted(
        bytes32 indexed skillId,
        address indexed executor,
        address indexed author,
        uint256 fee,
        uint256 authorShare,
        uint256 platformShare,
        uint256 timestamp
    );

    /// @notice Emitted when a skill is verified/unverified
    event SkillVerificationChanged(
        bytes32 indexed skillId,
        bool isVerified,
        uint256 timestamp
    );

    /// @notice Emitted when a skill is activated/deactivated
    event SkillStatusChanged(
        bytes32 indexed skillId,
        bool isActive,
        uint256 timestamp
    );

    /// @notice Emitted when co-owner share falls back to treasury
    event CoOwnerShareFallbackToTreasury(bytes32 indexed skillId, uint256 amount);

    /// @notice Emitted when treasury is updated
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );

    /// @notice Emitted when BONZAI token address is updated
    event BonzaiTokenUpdated(
        address indexed oldToken,
        address indexed newToken
    );

    /// @notice Emitted when skill ownership contract is updated
    event SkillOwnershipContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Thrown when skill already exists
    error SkillAlreadyExists(bytes32 skillId);

    /// @notice Thrown when skill does not exist
    error SkillNotFound(bytes32 skillId);

    /// @notice Thrown when skill is not active
    error SkillNotActive(bytes32 skillId);

    /// @notice Thrown when user already purchased the skill
    error AlreadyPurchased(address user, bytes32 skillId);

    /// @notice Thrown when user has not purchased the skill
    error NotPurchased(address user, bytes32 skillId);

    /// @notice Thrown when incorrect ETH amount is sent
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when caller is not the skill author
    error NotAuthor(address caller, address author);

    /// @notice Thrown when running fee exceeds maximum
    error RunningFeeTooHigh(uint256 fee, uint256 max);

    /// @notice Thrown when author has too many skills
    error TooManySkills(address author, uint256 count);

    /// @notice Thrown when name or version is empty
    error EmptyString();

    /// @notice Thrown when IPFS hash is invalid
    error InvalidIPFSHash();

    /// @notice Thrown when ETH transfer fails
    error TransferFailed(address recipient);

    /// @notice Thrown when category index is out of range (0-11)
    error InvalidCategory(string category);

    /// @notice Thrown when direct ETH transfer is attempted
    error UseCorrectFunction();

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Ensures the address is not zero
     */
    modifier notZeroAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    /**
     * @notice Ensures the skill exists
     */
    modifier skillExists(bytes32 skillId) {
        if (skills[skillId].author == address(0)) revert SkillNotFound(skillId);
        _;
    }

    /**
     * @notice Ensures the skill is active
     */
    modifier skillActive(bytes32 skillId) {
        if (!skills[skillId].isActive) revert SkillNotActive(skillId);
        _;
    }

    /**
     * @notice Ensures caller is the skill author
     */
    modifier onlyAuthor(bytes32 skillId) {
        if (skills[skillId].author != msg.sender) {
            revert NotAuthor(msg.sender, skills[skillId].author);
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Initialize the registry
     * @param _bonzaiToken BONZAI token contract address
     * @param _treasury Platform treasury address
     * @param _skillOwnershipContract Skill ownership contract address
     * @param _usdcToken USDC token contract address
     */
    constructor(
        address _bonzaiToken,
        address _treasury,
        address _skillOwnershipContract,
        address _usdcToken
    ) Ownable(msg.sender) {
        if (_bonzaiToken == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_usdcToken == address(0)) revert ZeroAddress();
        // _skillOwnershipContract can be zero — wired post-deploy via setSkillOwnershipContract()

        bonzaiToken = IERC20(_bonzaiToken);
        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
        skillOwnershipContract = _skillOwnershipContract;

        // Initialize valid categories (12 spending profile categories)
        validCategories["education"] = true;
        validCategories["entertainment"] = true;
        validCategories["fashion"] = true;
        validCategories["finance"] = true;
        validCategories["food"] = true;
        validCategories["healthcare"] = true;
        validCategories["housing"] = true;
        validCategories["beauty"] = true;
        validCategories["reading"] = true;
        validCategories["social"] = true;
        validCategories["travel"] = true;
        validCategories["sports"] = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SKILL REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new skill
     * @param name Skill name
     * @param version Semantic version (e.g., "1.0.0")
     * @param ipfsHash IPFS/Arweave hash of skill definition JSON
     * @param purchasePrice One-time purchase price in wei (0 for free skills)
     * @param runningFee Per-execution fee in BONZAI tokens (0 for no fee)
     * @return skillId The generated skill ID
     */
    function registerSkill(
        string calldata name,
        string calldata version,
        string calldata category,
        string calldata ipfsHash,
        uint256 purchasePrice,
        uint256 runningFee
    ) external nonReentrant whenNotPaused returns (bytes32 skillId) {
        // Validate inputs
        if (bytes(name).length == 0 || bytes(version).length == 0 || bytes(category).length == 0) revert EmptyString();
        if (!validCategories[category]) revert InvalidCategory(category);
        if (bytes(ipfsHash).length < 10) revert InvalidIPFSHash();
        if (runningFee > MAX_RUNNING_FEE) revert RunningFeeTooHigh(runningFee, MAX_RUNNING_FEE);

        // Check author skill limit
        if (authorSkills[msg.sender].length >= MAX_SKILLS_PER_AUTHOR) {
            revert TooManySkills(msg.sender, authorSkills[msg.sender].length);
        }

        // Generate skill ID
        skillId = keccak256(abi.encodePacked(name, version, msg.sender));

        // Check for duplicate
        if (skills[skillId].author != address(0)) revert SkillAlreadyExists(skillId);

        // Create skill
        skills[skillId] = Skill({
            id: skillId,
            author: msg.sender,
            name: name,
            version: version,
            category: category,
            ipfsHash: ipfsHash,
            purchasePrice: purchasePrice,
            runningFee: runningFee,
            isActive: true,
            isVerified: false,
            totalPurchases: 0,
            totalExecutions: 0,
            totalRevenue: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        // Track skill
        authorSkills[msg.sender].push(skillId);
        allSkillIds.push(skillId);

        emit SkillRegistered(
            skillId,
            msg.sender,
            name,
            version,
            category,
            ipfsHash,
            purchasePrice,
            runningFee,
            block.timestamp
        );

        return skillId;
    }

    /**
     * @notice Update an existing skill (author only)
     * @param skillId Skill to update
     * @param ipfsHash New IPFS hash (can be same)
     * @param purchasePrice New purchase price
     * @param runningFee New running fee
     */
    function updateSkill(
        bytes32 skillId,
        string calldata ipfsHash,
        uint256 purchasePrice,
        uint256 runningFee
    ) external nonReentrant skillExists(skillId) onlyAuthor(skillId) {
        if (bytes(ipfsHash).length < 10) revert InvalidIPFSHash();
        if (runningFee > MAX_RUNNING_FEE) revert RunningFeeTooHigh(runningFee, MAX_RUNNING_FEE);

        Skill storage skill = skills[skillId];
        skill.ipfsHash = ipfsHash;
        skill.purchasePrice = purchasePrice;
        skill.runningFee = runningFee;
        skill.updatedAt = block.timestamp;

        emit SkillUpdated(skillId, ipfsHash, purchasePrice, runningFee, block.timestamp);
    }

    /**
     * @notice Deactivate a skill (author only)
     * @param skillId Skill to deactivate
     */
    function deactivateSkill(bytes32 skillId)
        external
        skillExists(skillId)
        onlyAuthor(skillId)
    {
        skills[skillId].isActive = false;
        skills[skillId].updatedAt = block.timestamp;

        emit SkillStatusChanged(skillId, false, block.timestamp);
    }

    /**
     * @notice Reactivate a skill (author only)
     * @param skillId Skill to reactivate
     */
    function reactivateSkill(bytes32 skillId)
        external
        skillExists(skillId)
        onlyAuthor(skillId)
    {
        skills[skillId].isActive = true;
        skills[skillId].updatedAt = block.timestamp;

        emit SkillStatusChanged(skillId, true, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SKILL PURCHASE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Purchase a skill (one-time USDC payment)
     * @param skillId Skill to purchase
     * @dev Caller must approve USDC spending before calling. 80% to co-owners, 20% to treasury.
     */
    function purchaseSkill(bytes32 skillId)
        external
        nonReentrant
        whenNotPaused
        skillExists(skillId)
        skillActive(skillId)
    {
        Skill storage skill = skills[skillId];

        // Check not already purchased
        if (hasPurchased[msg.sender][skillId]) {
            revert AlreadyPurchased(msg.sender, skillId);
        }

        // Mark as purchased
        hasPurchased[msg.sender][skillId] = true;

        // Update stats
        uint256 price = skill.purchasePrice;
        unchecked {
            skill.totalPurchases += 1;
            skill.totalRevenue += price;
        }

        // Split revenue if there's a payment
        if (price > 0) {
            uint256 coOwnerShare;
            uint256 authorShare;

            unchecked {
                coOwnerShare = (price * CO_OWNER_SHARE_BPS) / BASIS_POINTS;
                authorShare = price - coOwnerShare;
            }

            // Transfer USDC from buyer to this contract first
            usdcToken.safeTransferFrom(msg.sender, address(this), price);

            // Transfer co-owner share to BonzaiSkillOwnership contract.
            // Approve + call distributeRevenueUSDC. Falls back to author on failure.
            usdcToken.safeIncreaseAllowance(skillOwnershipContract, coOwnerShare);
            try IBonzaiSkillOwnership(skillOwnershipContract).distributeRevenueUSDC(skillId, coOwnerShare) {
                // Success — co-owners credited
            } catch {
                // Fallback: send co-owner share to author so purchase still completes
                emit CoOwnerShareFallbackToTreasury(skillId, coOwnerShare);
                usdcToken.safeTransfer(skill.author, coOwnerShare);
            }

            // Transfer author share (20%) to skill author
            usdcToken.safeTransfer(skill.author, authorShare);

            // Track author fees
            unchecked {
                totalAuthorFeesUSDC += authorShare;
            }

            emit SkillPurchased(
                skillId,
                msg.sender,
                skill.author,
                price,
                coOwnerShare,
                authorShare,
                address(usdcToken),
                block.timestamp
            );
        } else {
            emit SkillPurchased(
                skillId,
                msg.sender,
                skill.author,
                0,
                0,
                0,
                address(usdcToken),
                block.timestamp
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SKILL EXECUTION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Record a skill execution and deduct running fee (USDC)
     * @param skillId Skill being executed
     * @dev Caller must have purchased the skill and approved USDC spending.
     *      Running fee is in USDC (6 decimals). 80% to co-owners, 20% to author.
     */
    function recordExecution(bytes32 skillId)
        external
        nonReentrant
        whenNotPaused
        skillExists(skillId)
        skillActive(skillId)
    {
        Skill storage skill = skills[skillId];

        // Check purchased (free skills with no purchase requirement skip this)
        if (skill.purchasePrice > 0 && !hasPurchased[msg.sender][skillId]) {
            revert NotPurchased(msg.sender, skillId);
        }

        // Update execution count
        unchecked {
            skill.totalExecutions += 1;
        }

        // Deduct running fee if applicable (USDC)
        if (skill.runningFee > 0) {
            uint256 coOwnerShare;
            uint256 authorShare;

            unchecked {
                coOwnerShare = (skill.runningFee * CO_OWNER_SHARE_BPS) / BASIS_POINTS;
                authorShare = skill.runningFee - coOwnerShare;
            }

            // Pull USDC from executor
            usdcToken.safeTransferFrom(msg.sender, address(this), skill.runningFee);

            // Transfer co-owner share to SkillOwnership for weighted distribution
            usdcToken.safeIncreaseAllowance(skillOwnershipContract, coOwnerShare);
            try IBonzaiSkillOwnership(skillOwnershipContract).distributeRevenueUSDC(skillId, coOwnerShare) {
                // Success
            } catch {
                // Fallback: send to author
                usdcToken.safeTransfer(skill.author, coOwnerShare);
            }

            // Transfer author share (20%)
            usdcToken.safeTransfer(skill.author, authorShare);

            // Track author running fees
            unchecked {
                totalAuthorRunningFeesUSDC += authorShare;
            }

            emit SkillExecuted(
                skillId,
                msg.sender,
                skill.author,
                skill.runningFee,
                coOwnerShare,
                authorShare,
                block.timestamp
            );
        } else {
            emit SkillExecuted(
                skillId,
                msg.sender,
                skill.author,
                0,
                0,
                0,
                block.timestamp
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Verify a skill (admin only)
     * @param skillId Skill to verify
     */
    function verifySkill(bytes32 skillId)
        external
        onlyOwner
        skillExists(skillId)
    {
        skills[skillId].isVerified = true;
        skills[skillId].updatedAt = block.timestamp;

        emit SkillVerificationChanged(skillId, true, block.timestamp);
    }

    /**
     * @notice Remove verification from a skill (admin only)
     * @param skillId Skill to unverify
     */
    function unverifySkill(bytes32 skillId)
        external
        onlyOwner
        skillExists(skillId)
    {
        skills[skillId].isVerified = false;
        skills[skillId].updatedAt = block.timestamp;

        emit SkillVerificationChanged(skillId, false, block.timestamp);
    }

    /**
     * @notice Force deactivate a skill (admin only, for policy violations)
     * @param skillId Skill to deactivate
     */
    function adminDeactivateSkill(bytes32 skillId)
        external
        onlyOwner
        skillExists(skillId)
    {
        skills[skillId].isActive = false;
        skills[skillId].isVerified = false;
        skills[skillId].updatedAt = block.timestamp;

        emit SkillStatusChanged(skillId, false, block.timestamp);
    }

    /**
     * @notice Update treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury)
        external
        onlyOwner
        notZeroAddress(_treasury)
    {
        address oldTreasury = treasury;
        treasury = _treasury;

        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Update BONZAI token address (for migrations)
     * @param _bonzaiToken New token address
     */
    function setBonzaiToken(address _bonzaiToken)
        external
        onlyOwner
        notZeroAddress(_bonzaiToken)
    {
        address oldToken = address(bonzaiToken);
        bonzaiToken = IERC20(_bonzaiToken);

        emit BonzaiTokenUpdated(oldToken, _bonzaiToken);
    }

    /**
     * @notice Update USDC token address
     * @param _usdcToken New USDC token address
     */
    function setUsdcToken(address _usdcToken)
        external
        onlyOwner
        notZeroAddress(_usdcToken)
    {
        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @notice Update skill ownership contract address
     * @param _skillOwnershipContract New ownership contract address
     */
    function setSkillOwnershipContract(address _skillOwnershipContract)
        external
        onlyOwner
        notZeroAddress(_skillOwnershipContract)
    {
        address old = skillOwnershipContract;
        skillOwnershipContract = _skillOwnershipContract;
        emit SkillOwnershipContractUpdated(old, _skillOwnershipContract);
    }

    /**
     * @notice Pause the registry (emergency stop)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get full skill details
     * @param skillId Skill ID to query
     * @return Skill struct
     */
    function getSkill(bytes32 skillId) external view returns (Skill memory) {
        return skills[skillId];
    }

    /**
     * @notice Check if user has purchased a skill
     * @param user User address
     * @param skillId Skill ID
     * @return True if purchased
     */
    function userHasPurchased(address user, bytes32 skillId) external view returns (bool) {
        return hasPurchased[user][skillId];
    }

    /**
     * @notice Check if user has purchased a skill (alias)
     * @param user User address
     * @param skillId Skill ID
     * @return True if purchased
     */
    function hasUserPurchased(address user, bytes32 skillId) external view returns (bool) {
        return hasPurchased[user][skillId];
    }

    /**
     * @notice Get all skills by an author
     * @param author Author address
     * @return Array of skill IDs
     */
    function getSkillsByAuthor(address author) external view returns (bytes32[] memory) {
        return authorSkills[author];
    }

    /**
     * @notice Get total number of skills
     * @return Count of all registered skills
     */
    function getTotalSkills() external view returns (uint256) {
        return allSkillIds.length;
    }

    /**
     * @notice Get skills with pagination
     * @param offset Starting index
     * @param limit Number of skills to return
     * @return Array of skill IDs
     */
    function getSkillsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory)
    {
        uint256 total = allSkillIds.length;

        if (offset >= total) {
            return new bytes32[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        bytes32[] memory result = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ) {
            result[i - offset] = allSkillIds[i];
            unchecked {
                i += 1;
            }
        }

        return result;
    }

    /**
     * @notice Generate skill ID from name, version, and author
     * @param name Skill name
     * @param version Skill version
     * @param author Author address
     * @return Skill ID
     */
    function generateSkillId(
        string calldata name,
        string calldata version,
        address author
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(name, version, author));
    }

    /**
     * @notice Get platform statistics
     * @return _totalSkills Total registered skills
     * @return _totalAuthorFeesUSDC Total USDC author fees from purchases
     * @return _totalAuthorRunningFeesUSDC Total USDC author fees from executions
     */
    function getStats() external view returns (
        uint256 _totalSkills,
        uint256 _totalAuthorFeesUSDC,
        uint256 _totalAuthorRunningFeesUSDC
    ) {
        return (
            allSkillIds.length,
            totalAuthorFeesUSDC,
            totalAuthorRunningFeesUSDC
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECEIVE / FALLBACK
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Reject direct ETH transfers - must use purchaseSkill()
     */
    receive() external payable {
        revert UseCorrectFunction();
    }

    /**
     * @notice Reject calls to non-existent functions
     */
    fallback() external payable {
        revert UseCorrectFunction();
    }
}
