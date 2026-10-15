// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBonzaiCollectibles {
    function initialize(
        address _owner,
        string calldata _name,
        address _treasury,
        address _factory
    ) external;
}

interface IBonzaiMintPoolAuth {
    function setAuthorizedMinter(address minter, bool authorized) external;
}

/**
 * @title BonzaiCollectiblesFactory
 * @notice ERC-1167 minimal proxy factory for BonzaiCollectibles.
 *         Each user gets one collection (clone). The factory deploys the clone,
 *         initializes it, and registers it as an authorized minter on BonzaiMintPool.
 */
contract BonzaiCollectiblesFactory is Ownable, ReentrancyGuard {
    using Clones for address;

    address public implementation;
    address public treasury;
    address public mintPool;
    address public royaltySplitter;
    address public unlockContract;
    address public stakingVault;
    /// @notice Default royalty bps clones use (informational; clone has its own admin setter).
    uint256 public originalCreatorRoyaltyBps = 250; // 2.5%

    /// @notice user address => their collection contract address
    mapping(address => address) public collections;
    address[] public allCollections;

    /// @notice Immutable membership of clones created by this factory, independent of NFT ownership.
    mapping(address => bool) public isCollection;

    event CollectionCreated(address indexed owner, address indexed collection, string name);
    event StakingVaultUpdated(address indexed oldVault, address indexed newVault);

    constructor(
        address _implementation,
        address _treasury,
        address _mintPool,
        address _royaltySplitter,
        address _unlockContract
    ) Ownable(msg.sender) {
        require(_implementation != address(0), "Zero implementation");
        require(_treasury != address(0), "Zero treasury");
        implementation = _implementation;
        treasury = _treasury;
        mintPool = _mintPool;
        royaltySplitter = _royaltySplitter;
        unlockContract = _unlockContract;
    }

    /**
     * @notice Get or create a user's collection. Returns existing if already created.
     * @param name_ Custom collection name for the ERC-721 metadata
     * @return The collection (clone) contract address
     */
    function getOrCreateCollection(string calldata name_) external nonReentrant returns (address) {
        if (collections[msg.sender] != address(0)) {
            return collections[msg.sender];
        }

        // Deploy minimal proxy
        address clone = implementation.clone();

        // Initialize the clone with the factory address — clone reads
        // mintPool / royaltySplitter / unlockContract live from the factory,
        // so clone owners can NEVER redirect them.
        IBonzaiCollectibles(clone).initialize(
            msg.sender,
            name_,
            treasury,
            address(this)
        );

        // Register clone as authorized minter on MintPool
        if (mintPool != address(0)) {
            IBonzaiMintPoolAuth(mintPool).setAuthorizedMinter(clone, true);
        }

        collections[msg.sender] = clone;
        isCollection[clone] = true;
        allCollections.push(clone);

        emit CollectionCreated(msg.sender, clone, name_);
        return clone;
    }

    /**
     * @notice Get a user's collection address (returns zero if none)
     */
    function getCollection(address user) external view returns (address) {
        return collections[user];
    }

    /**
     * @notice Total number of collections created
     */
    function totalCollections() external view returns (uint256) {
        return allCollections.length;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    function setImplementation(address _impl) external onlyOwner {
        require(_impl != address(0), "Zero implementation");
        implementation = _impl;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero treasury");
        treasury = _treasury;
    }

    function setMintPool(address _pool) external onlyOwner {
        mintPool = _pool;
    }

    function setRoyaltySplitter(address _splitter) external onlyOwner {
        royaltySplitter = _splitter;
    }

    function setUnlockContract(address _unlock) external onlyOwner {
        unlockContract = _unlock;
    }

    function setStakingVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero staking vault");
        address old = stakingVault;
        stakingVault = _vault;
        emit StakingVaultUpdated(old, _vault);
    }
}
