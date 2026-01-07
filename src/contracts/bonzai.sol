// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SmartAgentRegistry is Ownable {
    struct Agent {
        string name;
        string description;
        string endpoint; // Could be IPFS or HTTPS
        address developer;
        address agentToken; // Optional: ERC20 token for usage
        uint256 priceInAgentToken; // If > 0, use agentToken
    }

    IERC20 public immutable bonzai;
    uint256 public constant LISTING_FEE = 100 * 1e18; // 100 BONZAI to register

    Agent[] public agents;
    mapping(address => bool) public listedBy;

    event AgentRegistered(uint256 indexed agentId, string name, address dev);

    constructor(address _bonzaiToken) {
        bonzai = IERC20(_bonzaiToken);
    }

    function registerAgent(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        address agentToken,
        uint256 priceInAgentToken
    ) external {
        require(!listedBy[msg.sender], "Already registered");

        // Spend BONZAI token to list
        require(
            bonzai.transferFrom(msg.sender, address(this), LISTING_FEE),
            "BONZAI fee payment failed"
        );

        agents.push(
            Agent({
                name: name,
                description: description,
                endpoint: endpoint,
                developer: msg.sender,
                agentToken: agentToken,
                priceInAgentToken: priceInAgentToken
            })
        );

        listedBy[msg.sender] = true;

        emit AgentRegistered(agents.length - 1, name, msg.sender);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function allAgents() external view returns (Agent[] memory) {
        return agents;
    }
}
