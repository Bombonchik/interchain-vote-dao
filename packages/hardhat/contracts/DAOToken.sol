//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ERC20Votes } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import { Nonces } from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title DAOToken
 * @notice An ERC-20 governance token used to determine voting power on the Base Sepolia side.
 * @dev Inherits ERC20Votes for snapshotting and AccessControl for a flexible minting function.
 * This contract will be deployed on Base Sepolia (Chain B).
 */
contract DAOToken is ERC20, AccessControl, ERC20Permit, ERC20Votes {
    /**
     * @dev We create a MINTER_ROLE that is allowed to mint new tokens.
     */
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /**
     * @notice Constructor sets up the token name, symbol, and roles.
     * @dev The deployer (msg.sender) gets both the Admin and Minter roles by default.
     */
    constructor() ERC20("WormGov Token", "WGT") ERC20Permit("WormGov Token") {
        // Grant the deployer the default admin role (to manage other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Grant the deployer the minter role (to mint tokens)
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /**
     * @notice Mints new tokens and assigns them to an address.
     * @dev This function is protected and can only be called by an account with the MINTER_ROLE.
     * @param to The address to receive the new tokens.
     * @param amount The amount of tokens (in wei) to mint.
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    // --- OpenZeppelin Overrides ---
    // The following functions are overrides required by Solidity when combining
    // multiple OpenZeppelin contracts.

    /**
     * @dev This internal function is called by ERC20 (for transfers) and ERC20Votes (for snapshotting).
     * We must override it to tell Solidity to use the implementations from both parent contracts.
     */
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    /**
     * @dev This function is required when combining ERC20Permit (for gasless approvals)
     * with ERC20Votes (which also uses nonces).
     */
    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}