// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IBonzaiSkillTokenAccess {
    function hasTokenAccess(address user, bytes32 skillId) external view returns (bool);
}

/**
 * @title BonzaiSkillRegistry
 * @notice Registry and access control for BonzAI workflow skills.
 *
 * Skills are free to execute. A skill may be public or gated by ownership of
 * any companion token registered as an owner of that skill. Hiring a companion
 * into a BonzAI Company is handled by the Company charter and grants the same
 * specialized workflows to that role.
 */
contract BonzaiSkillRegistry is Ownable, Pausable {
    uint256 public constant MAX_SKILLS_PER_AUTHOR = 100;

    struct Skill {
        bytes32 id;
        address author;
        string name;
        string version;
        string category;
        string ipfsHash;
        bool tokenGated;
        bool isActive;
        bool isVerified;
        bool adminDeactivated;
        uint256 totalExecutions;
        uint256 createdAt;
        uint256 updatedAt;
    }

    address public skillOwnershipContract;
    mapping(bytes32 => Skill) public skills;
    mapping(address => bytes32[]) public authorSkills;
    mapping(string => bool) public validCategories;
    bytes32[] public allSkillIds;

    event SkillRegistered(
        bytes32 indexed skillId,
        address indexed author,
        string name,
        string version,
        string category,
        bool tokenGated
    );
    event SkillUpdated(bytes32 indexed skillId, string ipfsHash, bool tokenGated);
    event SkillExecuted(bytes32 indexed skillId, address indexed user, uint256 executionNumber);
    event SkillVerified(bytes32 indexed skillId, bool verified);
    event SkillStatusChanged(bytes32 indexed skillId, bool active);
    event SkillOwnershipContractUpdated(address indexed previousContract, address indexed newContract);

    error ZeroAddress();
    error EmptyField();
    error InvalidCategory();
    error SkillAlreadyExists();
    error SkillNotFound();
    error SkillInactive();
    error NotAuthor();
    error TooManySkills();
    error AdminDeactivated();
    error CompanionTokenRequired();
    error DirectPaymentsDisabled();

    constructor(address _skillOwnershipContract) Ownable(msg.sender) {
        skillOwnershipContract = _skillOwnershipContract;

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

    function registerSkill(
        string calldata name,
        string calldata version,
        string calldata category,
        string calldata ipfsHash,
        bool tokenGated
    ) external whenNotPaused returns (bytes32 skillId) {
        if (
            bytes(name).length == 0 ||
            bytes(version).length == 0 ||
            bytes(category).length == 0 ||
            bytes(ipfsHash).length == 0
        ) revert EmptyField();
        if (!validCategories[category]) revert InvalidCategory();
        if (authorSkills[msg.sender].length >= MAX_SKILLS_PER_AUTHOR) revert TooManySkills();

        skillId = keccak256(abi.encode(name, version, msg.sender));
        if (skills[skillId].author != address(0)) revert SkillAlreadyExists();

        skills[skillId] = Skill({
            id: skillId,
            author: msg.sender,
            name: name,
            version: version,
            category: category,
            ipfsHash: ipfsHash,
            tokenGated: tokenGated,
            isActive: true,
            isVerified: false,
            adminDeactivated: false,
            totalExecutions: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        authorSkills[msg.sender].push(skillId);
        allSkillIds.push(skillId);

        emit SkillRegistered(skillId, msg.sender, name, version, category, tokenGated);
    }

    function updateSkill(bytes32 skillId, string calldata ipfsHash, bool tokenGated) external whenNotPaused {
        Skill storage skill = _existingSkill(skillId);
        if (skill.author != msg.sender) revert NotAuthor();
        if (bytes(ipfsHash).length == 0) revert EmptyField();

        skill.ipfsHash = ipfsHash;
        skill.tokenGated = tokenGated;
        skill.updatedAt = block.timestamp;
        emit SkillUpdated(skillId, ipfsHash, tokenGated);
    }

    function recordExecution(bytes32 skillId) external whenNotPaused {
        Skill storage skill = _existingSkill(skillId);
        if (!skill.isActive) revert SkillInactive();
        if (skill.tokenGated) {
            if (
                skillOwnershipContract == address(0) ||
                !IBonzaiSkillTokenAccess(skillOwnershipContract).hasTokenAccess(msg.sender, skillId)
            ) revert CompanionTokenRequired();
        }

        unchecked {
            skill.totalExecutions += 1;
        }
        emit SkillExecuted(skillId, msg.sender, skill.totalExecutions);
    }

    function userHasAccess(address user, bytes32 skillId) public view returns (bool) {
        Skill storage skill = skills[skillId];
        if (skill.author == address(0) || !skill.isActive) return false;
        if (!skill.tokenGated) return true;
        if (skillOwnershipContract == address(0)) return false;
        return IBonzaiSkillTokenAccess(skillOwnershipContract).hasTokenAccess(user, skillId);
    }

    function deactivateSkill(bytes32 skillId) external {
        Skill storage skill = _existingSkill(skillId);
        if (skill.author != msg.sender) revert NotAuthor();
        skill.isActive = false;
        skill.updatedAt = block.timestamp;
        emit SkillStatusChanged(skillId, false);
    }

    function reactivateSkill(bytes32 skillId) external {
        Skill storage skill = _existingSkill(skillId);
        if (skill.author != msg.sender) revert NotAuthor();
        if (skill.adminDeactivated) revert AdminDeactivated();
        skill.isActive = true;
        skill.updatedAt = block.timestamp;
        emit SkillStatusChanged(skillId, true);
    }

    function adminDeactivateSkill(bytes32 skillId) external onlyOwner {
        Skill storage skill = _existingSkill(skillId);
        skill.isActive = false;
        skill.adminDeactivated = true;
        skill.updatedAt = block.timestamp;
        emit SkillStatusChanged(skillId, false);
    }

    function setSkillVerified(bytes32 skillId, bool verified) external onlyOwner {
        Skill storage skill = _existingSkill(skillId);
        skill.isVerified = verified;
        skill.updatedAt = block.timestamp;
        emit SkillVerified(skillId, verified);
    }

    function setSkillOwnershipContract(address newContract) external onlyOwner {
        if (newContract == address(0)) revert ZeroAddress();
        address previous = skillOwnershipContract;
        skillOwnershipContract = newContract;
        emit SkillOwnershipContractUpdated(previous, newContract);
    }

    function setCategoryValidity(string calldata category, bool valid) external onlyOwner {
        if (bytes(category).length == 0) revert EmptyField();
        validCategories[category] = valid;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getSkill(bytes32 skillId) external view returns (Skill memory) {
        if (skills[skillId].author == address(0)) revert SkillNotFound();
        return skills[skillId];
    }

    function getSkillsPaginated(uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        if (offset >= allSkillIds.length || limit == 0) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > allSkillIds.length) end = allSkillIds.length;
        page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = allSkillIds[i];
        }
    }

    function getAuthorSkills(address author) external view returns (bytes32[] memory) {
        return authorSkills[author];
    }

    function totalSkills() external view returns (uint256) {
        return allSkillIds.length;
    }

    function _existingSkill(bytes32 skillId) internal view returns (Skill storage skill) {
        skill = skills[skillId];
        if (skill.author == address(0)) revert SkillNotFound();
    }

    receive() external payable {
        revert DirectPaymentsDisabled();
    }

    fallback() external payable {
        revert DirectPaymentsDisabled();
    }
}
