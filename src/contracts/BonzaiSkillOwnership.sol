// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title BonzaiSkillOwnership
 * @author BonzAI Team
 * @notice Co-ownership contract for BonzAI skills. Companions register as co-owners
 *         and earn BONZAI-weighted revenue when skills are purchased.
 * @dev Deployed on Base (8453). Receives ETH from BonzaiSkillRegistry.purchaseSkill()
 *      and distributes 80% of purchase price to registered companion co-owners.
 *
 * Architecture:
 *   - BonzaiCompanions NFT lives on Base (8453)
 *   - This contract also lives on Base (8453)
 *   - A trusted attestationSigner verifies companion data (NFT ownership + spending profile)
 *     and signs an EIP-191 message that this contract validates on registration.
 *
 * Revenue distribution formula (at purchase time):
 *   weight_i = BONZAI_balance(companionWallet_i) * profileScore_i
 *   share_i  = weight_i / totalWeight * msg.value
 *
 * Spending profile category indices (matching BonzaiCompanions.sol bit packing):
 *   0=education  1=entertainment  2=fashion  3=finance  4=food  5=healthcare
 *   6=housing    7=beauty         8=reading  9=social   10=travel 11=sports
 */
contract BonzaiSkillOwnership is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Minimum spending profile score to register for a skill
    uint8 public constant MIN_PROFILE_SCORE = 5;

    /// @notice Maximum companions per skill (gas limit protection)
    uint256 public constant MAX_COMPANIONS_PER_SKILL = 100;

    /// @notice Number of spending profile categories
    uint256 public constant NUM_CATEGORIES = 12;

    // ═══════════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice On-chain record of a companion registered as co-owner of a skill
    struct CompanionRegistration {
        uint256 companionTokenId;   // NFT token ID on Base
        address companionWallet;    // Agent wallet (receives revenue)
        address ownerAddress;       // NFT owner who registered
        uint8 profileScore;         // Spending profile score for this skill's category (1-15)
        uint256 registeredAt;       // Block timestamp of registration
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice BonzaiCompanions NFT contract (for on-chain ownership verification)
    IERC721 public companionNFT;

    /// @notice BonzaiSkillRegistry contract (only caller for distributeRevenue)
    address public skillRegistry;

    /// @notice BONZAI token for balance-weighted distribution
    IERC20 public bonzaiToken;

    /// @notice Treasury for fallback revenue (when no co-owners registered)
    address public treasury;

    /// @notice Trusted signer for cross-chain attestation (verifies Base chain data)
    address public attestationSigner;

    /// @notice Skill ID => array of registered companions
    mapping(bytes32 => CompanionRegistration[]) public skillCompanions;

    /// @notice Companion token ID => skill ID => index in skillCompanions array (+ 1, 0 = not registered)
    mapping(uint256 => mapping(bytes32 => uint256)) private _companionSkillIndex;

    /// @notice USDC token — the only currency this marketplace distributes.
    IERC20 public usdcToken;

    /// @notice Wallet => total unclaimed USDC revenue
    mapping(address => uint256) public unclaimedRevenueUSDC;

    /// @notice Total USDC revenue distributed
    uint256 public totalRevenueDistributedUSDC;

    /// @notice Total USDC revenue claimed
    uint256 public totalRevenueClaimedUSDC;

    /// @notice Category string => on-chain index (matching BonzaiCompanions.sol packing)
    mapping(string => uint8) public categoryToIndex;

    /// @notice Tracks used attestation signatures to prevent replay
    mapping(bytes32 => bool) public usedAttestations;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event CompanionRegistered(
        bytes32 indexed skillId,
        uint256 indexed companionTokenId,
        address companionWallet,
        address ownerAddress,
        uint8 profileScore,
        uint256 timestamp
    );

    event CompanionDeregistered(
        bytes32 indexed skillId,
        uint256 indexed companionTokenId,
        address ownerAddress,
        uint256 timestamp
    );

    event RevenueFallbackToTreasury(
        bytes32 indexed skillId,
        uint256 amount,
        uint256 timestamp
    );

    event RevenueDistributedUSDC(
        bytes32 indexed skillId,
        uint256 totalAmount,
        uint256 recipientCount,
        uint256 timestamp
    );

    /// @notice Per-recipient payout detail — emitted for every non-zero share
    /// so historical distribution breakdowns can be reconstructed off-chain.
    event CompanionRevenueShare(
        bytes32 indexed skillId,
        address indexed wallet,
        uint256 indexed companionTokenId,
        uint256 share,
        uint256 weight,
        uint256 totalWeight,
        uint256 timestamp
    );

    event RevenueClaimedUSDC(
        address indexed wallet,
        uint256 amount,
        uint256 timestamp
    );

    event CompanionRegistrationUpdated(
        bytes32 indexed skillId,
        uint256 indexed companionTokenId,
        address newWallet,
        uint8 newProfileScore,
        uint256 timestamp
    );

    event AttestationSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SkillRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event BonzaiTokenUpdated(address indexed oldToken, address indexed newToken);
    event CompanionNFTUpdated(address indexed oldNFT, address indexed newNFT);
    event UsdcTokenUpdated(address indexed oldToken, address indexed newToken);

    // ═══════════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error OnlySkillRegistry();
    error ZeroAddress();
    error InvalidProfileScore(uint8 score, uint8 minimum);
    error CompanionAlreadyRegistered(uint256 companionTokenId, bytes32 skillId);
    error CompanionNotRegistered(uint256 companionTokenId, bytes32 skillId);
    error NotRegistrationOwner(address caller, address owner);
    error TooManyCompanions(bytes32 skillId, uint256 count);
    error InvalidAttestation();
    error AttestationExpired();
    error NoRevenueToClaim();
    error TransferFailed(address recipient);
    error NotNFTOwner(address caller, uint256 tokenId);
    error NoSurplus();
    error BonzaiTokenUpdated_TransferFailed();

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════

    modifier onlySkillRegistry() {
        if (msg.sender != skillRegistry) revert OnlySkillRegistry();
        _;
    }

    modifier notZeroAddress(address addr) {
        if (addr == address(0)) revert ZeroAddress();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(
        address _skillRegistry,
        address _bonzaiToken,
        address _treasury,
        address _attestationSigner,
        address _companionNFT
    ) Ownable(msg.sender) {
        if (_skillRegistry == address(0)) revert ZeroAddress();
        if (_bonzaiToken == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_attestationSigner == address(0)) revert ZeroAddress();
        if (_companionNFT == address(0)) revert ZeroAddress();

        skillRegistry = _skillRegistry;
        bonzaiToken = IERC20(_bonzaiToken);
        treasury = _treasury;
        attestationSigner = _attestationSigner;
        companionNFT = IERC721(_companionNFT);

        // Initialize category index mapping (matches BonzaiCompanions.sol bit packing order)
        categoryToIndex["education"] = 0;
        categoryToIndex["entertainment"] = 1;
        categoryToIndex["fashion"] = 2;
        categoryToIndex["finance"] = 3;
        categoryToIndex["food"] = 4;
        categoryToIndex["healthcare"] = 5;
        categoryToIndex["housing"] = 6;
        categoryToIndex["beauty"] = 7;
        categoryToIndex["reading"] = 8;
        categoryToIndex["social"] = 9;
        categoryToIndex["travel"] = 10;
        categoryToIndex["sports"] = 11;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPANION REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a companion as co-owner of a skill
     * @param skillId The skill to register for
     * @param companionTokenId NFT token ID on Base
     * @param companionWallet Agent wallet address (receives revenue)
     * @param profileScore Spending profile score for the skill's category (1-15)
     * @param attestationDeadline Expiration timestamp for the attestation
     * @param attestation EIP-191 signature from attestationSigner verifying Base chain data
     * @dev The attestation proves:
     *   1. The caller owns the companion NFT on Base
     *   2. The companion's spending profile has the claimed score in the relevant category
     *   3. The companion wallet is correctly associated with the NFT
     */
    function registerCompanion(
        bytes32 skillId,
        uint256 companionTokenId,
        address companionWallet,
        uint8 profileScore,
        uint256 attestationDeadline,
        bytes calldata attestation
    ) external nonReentrant whenNotPaused {
        // Validate inputs
        if (companionWallet == address(0)) revert ZeroAddress();
        if (profileScore < MIN_PROFILE_SCORE) {
            revert InvalidProfileScore(profileScore, MIN_PROFILE_SCORE);
        }
        if (block.timestamp > attestationDeadline) revert AttestationExpired();

        // On-chain NFT ownership verification
        if (companionNFT.ownerOf(companionTokenId) != msg.sender) {
            revert NotNFTOwner(msg.sender, companionTokenId);
        }

        // Check not already registered
        if (_companionSkillIndex[companionTokenId][skillId] != 0) {
            revert CompanionAlreadyRegistered(companionTokenId, skillId);
        }

        // Check companion limit
        if (skillCompanions[skillId].length >= MAX_COMPANIONS_PER_SKILL) {
            revert TooManyCompanions(skillId, skillCompanions[skillId].length);
        }

        // Verify cross-chain attestation
        _verifyAttestation(
            skillId,
            companionTokenId,
            companionWallet,
            msg.sender,
            profileScore,
            attestationDeadline,
            attestation
        );

        // Register companion
        skillCompanions[skillId].push(CompanionRegistration({
            companionTokenId: companionTokenId,
            companionWallet: companionWallet,
            ownerAddress: msg.sender,
            profileScore: profileScore,
            registeredAt: block.timestamp
        }));

        // Store index (1-based to distinguish from "not registered" = 0)
        _companionSkillIndex[companionTokenId][skillId] = skillCompanions[skillId].length;

        emit CompanionRegistered(
            skillId,
            companionTokenId,
            companionWallet,
            msg.sender,
            profileScore,
            block.timestamp
        );
    }

    /**
     * @notice Deregister a companion from a skill (owner only)
     * @param skillId The skill to deregister from
     * @param companionTokenId The companion to deregister
     */
    function deregisterCompanion(
        bytes32 skillId,
        uint256 companionTokenId
    ) external nonReentrant {
        uint256 indexPlusOne = _companionSkillIndex[companionTokenId][skillId];
        if (indexPlusOne == 0) {
            revert CompanionNotRegistered(companionTokenId, skillId);
        }

        uint256 index = indexPlusOne - 1;
        CompanionRegistration storage reg = skillCompanions[skillId][index];

        address currentOwner = companionNFT.ownerOf(reg.companionTokenId);
        require(currentOwner == msg.sender || reg.ownerAddress == msg.sender, "Not companion owner");

        // Swap with last element and pop (gas-efficient removal)
        uint256 lastIndex = skillCompanions[skillId].length - 1;
        if (index != lastIndex) {
            CompanionRegistration storage lastReg = skillCompanions[skillId][lastIndex];
            skillCompanions[skillId][index] = lastReg;
            _companionSkillIndex[lastReg.companionTokenId][skillId] = indexPlusOne;
        }
        skillCompanions[skillId].pop();
        delete _companionSkillIndex[companionTokenId][skillId];

        emit CompanionDeregistered(skillId, companionTokenId, msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REVENUE DISTRIBUTION (Called by SkillRegistry on purchase)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute USDC purchase revenue to registered companion co-owners
     * @param skillId The skill being purchased
     * @param amount The USDC amount to distribute (must be pre-approved and transferred to this contract)
     * @dev Called by BonzaiSkillRegistry.purchaseSkill() after USDC transfer.
     *      Distribution is weighted by: BONZAI_balance(companionWallet) * profileScore
     *      If no co-owners registered, revenue goes to treasury.
     */
    function distributeRevenueUSDC(
        bytes32 skillId,
        uint256 amount
    ) external onlySkillRegistry nonReentrant whenNotPaused {
        require(address(usdcToken) != address(0), "USDC token not set");

        // Pull USDC from the caller (SkillRegistry)
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        CompanionRegistration[] storage companions = skillCompanions[skillId];

        // Fallback: no co-owners, send to treasury
        if (companions.length == 0) {
            usdcToken.safeTransfer(treasury, amount);
            emit RevenueFallbackToTreasury(skillId, amount, block.timestamp);
            return;
        }

        // Calculate weights for all eligible companions
        uint256 totalWeight = 0;
        uint256[] memory weights = new uint256[](companions.length);
        uint256 activeCount = 0;

        for (uint256 i = 0; i < companions.length; ) {
            // Skip companions whose NFT is no longer owned by the registrant
            try companionNFT.ownerOf(companions[i].companionTokenId) returns (address currentOwner) {
                if (currentOwner != companions[i].ownerAddress) {
                    unchecked { i++; }
                    continue;
                }
            } catch {
                unchecked { i++; }
                continue;
            }

            uint256 bonzaiBalance = bonzaiToken.balanceOf(companions[i].companionWallet);
            uint256 normalizedBalance = bonzaiBalance / 1e18;
            if (normalizedBalance == 0) normalizedBalance = 1;
            weights[i] = normalizedBalance * uint256(companions[i].profileScore);
            totalWeight += weights[i];
            activeCount++;
            unchecked { i++; }
        }

        // Fallback: all companions have zero weight
        if (totalWeight == 0 || activeCount == 0) {
            usdcToken.safeTransfer(treasury, amount);
            emit RevenueFallbackToTreasury(skillId, amount, block.timestamp);
            return;
        }

        // Distribute proportionally, crediting unclaimed USDC balances.
        // Emit a per-recipient event so historical distribution breakdowns
        // can be reconstructed off-chain without needing new storage.
        uint256 distributed = 0;
        for (uint256 i = 0; i < companions.length; ) {
            if (weights[i] > 0) {
                uint256 share = (amount * weights[i]) / totalWeight;
                if (share > 0) {
                    address wallet = companions[i].companionWallet;
                    unclaimedRevenueUSDC[wallet] += share;
                    distributed += share;
                    emit CompanionRevenueShare(
                        skillId,
                        wallet,
                        companions[i].companionTokenId,
                        share,
                        weights[i],
                        totalWeight,
                        block.timestamp
                    );
                }
            }
            unchecked { i++; }
        }

        // Dust goes to treasury (rounding remainder)
        uint256 dust = amount - distributed;
        if (dust > 0) {
            usdcToken.safeTransfer(treasury, dust);
        }

        totalRevenueDistributedUSDC += amount;

        emit RevenueDistributedUSDC(skillId, amount, activeCount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // REVENUE CLAIMING
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Claim all accumulated USDC revenue
     * @dev Transfers accumulated USDC to caller.
     */
    function claimRevenueUSDC() external nonReentrant {
        uint256 amount = unclaimedRevenueUSDC[msg.sender];
        if (amount == 0) revert NoRevenueToClaim();

        // Effects before interactions
        unclaimedRevenueUSDC[msg.sender] = 0;
        totalRevenueClaimedUSDC += amount;

        // Transfer USDC
        usdcToken.safeTransfer(msg.sender, amount);

        emit RevenueClaimedUSDC(msg.sender, amount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPANION UPDATE
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Update a companion's registration without deregister+reregister
     * @param skillId The skill the companion is registered for
     * @param companionTokenId The companion to update
     * @param newWallet New agent wallet address
     * @param newProfileScore New spending profile score
     * @param attestationDeadline Expiration timestamp for the attestation
     * @param attestation EIP-191 signature from attestationSigner
     */
    function updateCompanionRegistration(
        bytes32 skillId,
        uint256 companionTokenId,
        address newWallet,
        uint8 newProfileScore,
        uint256 attestationDeadline,
        bytes calldata attestation
    ) external nonReentrant whenNotPaused {
        if (newWallet == address(0)) revert ZeroAddress();
        if (newProfileScore < MIN_PROFILE_SCORE) {
            revert InvalidProfileScore(newProfileScore, MIN_PROFILE_SCORE);
        }
        if (block.timestamp > attestationDeadline) revert AttestationExpired();

        uint256 indexPlusOne = _companionSkillIndex[companionTokenId][skillId];
        if (indexPlusOne == 0) {
            revert CompanionNotRegistered(companionTokenId, skillId);
        }

        CompanionRegistration storage reg = skillCompanions[skillId][indexPlusOne - 1];
        if (reg.ownerAddress != msg.sender) {
            revert NotRegistrationOwner(msg.sender, reg.ownerAddress);
        }

        // On-chain NFT ownership verification
        if (companionNFT.ownerOf(companionTokenId) != msg.sender) {
            revert NotNFTOwner(msg.sender, companionTokenId);
        }

        // Verify attestation
        _verifyAttestation(
            skillId,
            companionTokenId,
            newWallet,
            msg.sender,
            newProfileScore,
            attestationDeadline,
            attestation
        );

        reg.companionWallet = newWallet;
        reg.profileScore = newProfileScore;

        emit CompanionRegistrationUpdated(
            skillId,
            companionTokenId,
            newWallet,
            newProfileScore,
            block.timestamp
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ATTESTATION VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @dev Verify EIP-191 attestation from trusted signer with replay protection
     */
    function _verifyAttestation(
        bytes32 skillId,
        uint256 companionTokenId,
        address companionWallet,
        address ownerAddress,
        uint8 profileScore,
        uint256 deadline,
        bytes calldata attestation
    ) internal {
        bytes32 messageHash = keccak256(abi.encodePacked(
            skillId,
            companionTokenId,
            companionWallet,
            ownerAddress,
            profileScore,
            deadline,
            block.chainid,
            address(this)
        ));

        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recoveredSigner = ethSignedHash.recover(attestation);

        if (recoveredSigner != attestationSigner) revert InvalidAttestation();

        // Prevent attestation replay
        bytes32 attestationId = keccak256(abi.encodePacked(attestation));
        require(!usedAttestations[attestationId], "Attestation already used");
        usedAttestations[attestationId] = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Get all registered companions for a skill
     * @param skillId The skill to query
     * @return Array of CompanionRegistration structs
     */
    function getSkillCompanions(bytes32 skillId)
        external
        view
        returns (CompanionRegistration[] memory)
    {
        return skillCompanions[skillId];
    }

    /**
     * @notice Get count of registered companions for a skill
     * @param skillId The skill to query
     * @return Number of registered companions
     */
    function getSkillCompanionCount(bytes32 skillId)
        external
        view
        returns (uint256)
    {
        return skillCompanions[skillId].length;
    }

    /**
     * @notice Check if a companion is registered for a skill
     * @param companionTokenId The companion token ID
     * @param skillId The skill ID
     * @return True if registered
     */
    function isCompanionRegistered(uint256 companionTokenId, bytes32 skillId)
        external
        view
        returns (bool)
    {
        return _companionSkillIndex[companionTokenId][skillId] != 0;
    }

    /**
     * @notice Get a companion's registration details for a skill
     * @param companionTokenId The companion token ID
     * @param skillId The skill ID
     * @return The registration details
     */
    function getCompanionRegistration(uint256 companionTokenId, bytes32 skillId)
        external
        view
        returns (CompanionRegistration memory)
    {
        uint256 indexPlusOne = _companionSkillIndex[companionTokenId][skillId];
        if (indexPlusOne == 0) revert CompanionNotRegistered(companionTokenId, skillId);
        return skillCompanions[skillId][indexPlusOne - 1];
    }

    /**
     * @notice Get unclaimed revenue for a wallet per skill
     * @dev Per-skill breakdown was ETH-only and retired with USDC-only payout.
     *      Kept as a no-op getter for ABI compatibility; returns 0 always.
     * @return 0 (per-skill tracking not maintained in USDC-only marketplace)
     */
    function getUnclaimedRevenuePerSkill(address /* wallet */, bytes32 /* skillId */)
        external
        pure
        returns (uint256)
    {
        return 0;
    }

    /**
     * @notice Get contract statistics (USDC).
     * @return _totalDistributed Total USDC distributed (6 decimals)
     * @return _totalClaimed Total USDC claimed (6 decimals)
     * @return _contractBalance Current USDC balance held by contract
     */
    function getStats() external view returns (
        uint256 _totalDistributed,
        uint256 _totalClaimed,
        uint256 _contractBalance
    ) {
        return (
            totalRevenueDistributedUSDC,
            totalRevenueClaimedUSDC,
            usdcToken.balanceOf(address(this))
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the attestation signer (for key rotation)
     * @param _signer New attestation signer address
     */
    function setAttestationSigner(address _signer)
        external
        onlyOwner
        notZeroAddress(_signer)
    {
        address old = attestationSigner;
        attestationSigner = _signer;
        emit AttestationSignerUpdated(old, _signer);
    }

    /**
     * @notice Update the skill registry address
     * @param _registry New skill registry address
     */
    function setSkillRegistry(address _registry)
        external
        onlyOwner
        notZeroAddress(_registry)
    {
        address old = skillRegistry;
        skillRegistry = _registry;
        emit SkillRegistryUpdated(old, _registry);
    }

    /**
     * @notice Update the treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury)
        external
        onlyOwner
        notZeroAddress(_treasury)
    {
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    /**
     * @notice Update the BONZAI token address
     * @param _token New BONZAI token address
     */
    function setBonzaiToken(address _token)
        external
        onlyOwner
        notZeroAddress(_token)
    {
        address old = address(bonzaiToken);
        bonzaiToken = IERC20(_token);
        emit BonzaiTokenUpdated(old, _token);
    }

    /**
     * @notice Update the USDC token address
     * @param _usdcToken New USDC token address
     */
    function setUsdcToken(address _usdcToken)
        external
        onlyOwner
        notZeroAddress(_usdcToken)
    {
        address old = address(usdcToken);
        usdcToken = IERC20(_usdcToken);
        emit UsdcTokenUpdated(old, _usdcToken);
    }

    /**
     * @notice Update the companion NFT contract address
     * @param _companionNFT New companion NFT address
     */
    function setCompanionNFT(address _companionNFT)
        external
        onlyOwner
        notZeroAddress(_companionNFT)
    {
        address old = address(companionNFT);
        companionNFT = IERC721(_companionNFT);
        emit CompanionNFTUpdated(old, _companionNFT);
    }

    /**
     * @notice Pause the contract (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Withdraw surplus USDC that is NOT owed to co-owners.
     * @dev accountable = totalRevenueDistributedUSDC - totalRevenueClaimedUSDC
     *      surplus = usdcToken.balanceOf(this) - accountable
     */
    function withdrawSurplus() external onlyOwner {
        uint256 accountable = totalRevenueDistributedUSDC - totalRevenueClaimedUSDC;
        uint256 balance = usdcToken.balanceOf(address(this));
        if (balance <= accountable) revert NoSurplus();

        uint256 surplus = balance - accountable;
        usdcToken.safeTransfer(owner(), surplus);
    }

    // ═══════════════════════════════════════════════════════════════════════════
}
