// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title CompanionToken
 * @notice Fixed-supply social token with signed payments on the configured EVM chain.
 * @dev Simple token with metadata linking to companion NFT and agent wallet
 *
 * Features:
 * - Fixed 1 billion total supply (minted to deployer/factory)
 * - Burnable by any holder (deflationary)
 * - No trading tax or special transfer logic
 * - Stores companion's profile image URI for token lists
 * - Links to companion's agent wallet address
 * - Tracks NFT token ID for on-chain verification
 * - Factory-created LP positions are permanently held by the shared fee vault
 */
contract CompanionToken is ERC20, ERC20Burnable, EIP712 {
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");
    event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer,bytes32 indexed nonce);
    /// @notice IPFS URI of the companion's profile image
    string public imageURI;

    /// @notice Companion's agent wallet address (for metadata/verification)
    address public immutable agentWallet;

    /// @notice NFT token ID on the companion contract (0 if not minted)
    uint256 public immutable companionId;

    /// @notice Factory that deployed this token
    address public immutable factory;

    /// @notice Deployment timestamp
    uint256 public immutable deployedAt;

    /**
     * @notice Deploy a new companion token
     * @param name Token name (companion's full name, e.g., "Aurore Delacroix")
     * @param symbol Token symbol (companion's first name uppercase, e.g., "AURORE")
     * @param totalSupply Total token supply (typically 1 billion * 10^18)
     * @param recipient Address to receive all tokens (factory for liquidity)
     * @param _imageURI IPFS URI of companion's profile image
     * @param _agentWallet Agent wallet address of the companion
     * @param _companionId NFT token ID of the companion (0 if not minted as NFT)
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address recipient,
        string memory _imageURI,
        address _agentWallet,
        uint256 _companionId
    ) ERC20(name, symbol) EIP712(name, "1") {
        require(recipient != address(0), "Invalid recipient");
        require(_agentWallet != address(0), "Invalid agent wallet address");

        imageURI = _imageURI;
        agentWallet = _agentWallet;
        companionId = _companionId;
        factory = msg.sender;
        deployedAt = block.timestamp;

        _mint(recipient, totalSupply);
    }

    function DOMAIN_SEPARATOR() external view returns(bytes32) { return _domainSeparatorV4(); }
    /// @notice EIP-3009: any relayer can submit an exact, single-use signed payment.
    /// @dev Compatible with x402 exact; no hosted facilitator or Permit2 dependency.
    function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external {
        _authorizedTransfer(TRANSFER_WITH_AUTHORIZATION_TYPEHASH,from,to,value,validAfter,validBefore,nonce,v,r,s);
    }
    function receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external {
        require(msg.sender==to,"Caller must be payee");
        _authorizedTransfer(RECEIVE_WITH_AUTHORIZATION_TYPEHASH,from,to,value,validAfter,validBefore,nonce,v,r,s);
    }
    function cancelAuthorization(address authorizer,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external {
        require(!authorizationState[authorizer][nonce],"Authorization already used");
        require(ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH,authorizer,nonce))),v,r,s)==authorizer,"Invalid authorization");
        authorizationState[authorizer][nonce]=true;emit AuthorizationCanceled(authorizer,nonce);
    }
    function _authorizedTransfer(bytes32 typeHash,address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) private {
        require(block.timestamp>validAfter&&block.timestamp<validBefore,"Authorization outside validity window");
        require(!authorizationState[from][nonce],"Authorization already used");
        require(ECDSA.recover(_hashTypedDataV4(keccak256(abi.encode(typeHash,from,to,value,validAfter,validBefore,nonce))),v,r,s)==from,"Invalid authorization");
        authorizationState[from][nonce]=true;emit AuthorizationUsed(from,nonce);
        _transfer(from,to,value);
    }

    /**
     * @notice Get token metadata for token list registration
     * @return name_ Token name
     * @return symbol_ Token symbol
     * @return decimals_ Token decimals (18)
     * @return image_ IPFS image URI
     * @return agentWallet_ Agent wallet address
     * @return companionId_ NFT token ID
     */
    function getTokenInfo()
        external
        view
        returns (
            string memory name_,
            string memory symbol_,
            uint8 decimals_,
            string memory image_,
            address agentWallet_,
            uint256 companionId_
        )
    {
        return (name(), symbol(), decimals(), imageURI, agentWallet, companionId);
    }
}
