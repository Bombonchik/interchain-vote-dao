//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "./interfaces/ITreasury.sol";

/**
 * @title IWormholeReceiver
 * @notice Interface for the Wormhole Relayer to call into our contract.
 */
interface IWormholeReceiver {
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory additionalVaas,
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32 deliveryHash
    ) external payable;
}

/**
 * @title Receiver
 * @notice Receives verified messages from Base Sepolia and triggers the Treasury.
 */
contract Receiver is IWormholeReceiver {

    // --- Configuration ---
    // The official Wormhole Relayer address on Sepolia
    address public immutable wormholeRelayer;
    // The Treasury contract we control
    ITreasury public immutable treasury;
    
    // --- Authorization ---
    // The approved sender address on the source chain (Voter.sol)
    bytes32 public immutable authorizedEmitter;
    // The approved source chain ID (Base Sepolia = 10004)
    uint16 public constant SOURCE_CHAIN_ID = 10004;

    event ProposalReceived(uint256 indexed sourceChain, bytes32 indexed sourceAddress);

    constructor(
        address _wormholeRelayer,
        address _treasury,
        bytes32 _authorizedEmitter
    ) {
        wormholeRelayer = _wormholeRelayer;
        treasury = ITreasury(_treasury);
        authorizedEmitter = _authorizedEmitter;
    }

    /**
     * @notice The entry point called by the Wormhole Relayer.
     * @dev Perform strict security checks before executing the payload.
     */
    function receiveWormholeMessages(
        bytes memory payload,
        bytes[] memory, // additionalVaas (unused)
        bytes32 sourceAddress,
        uint16 sourceChain,
        bytes32 // deliveryHash (unused)
    ) external payable override {
        // Only the official Wormhole Relayer can call this function
        require(msg.sender == wormholeRelayer, "Receiver: Only Relayer allowed");

        // Ensure the message came from the correct chain (Base Sepolia)
        require(sourceChain == SOURCE_CHAIN_ID, "Receiver: Wrong source chain");

        // Ensure the message came from our trusted Voter contract
        require(sourceAddress == authorizedEmitter, "Receiver: Unauthorized emitter");

        // Decode the payload (Must match encoding in Voter.sol)
        (
            address target,
            uint256 value,
            bytes memory data
        ) = abi.decode(payload, (address, uint256, bytes));

        // Execute the action on the Treasury
        treasury.executeProposal(target, value, data);

        emit ProposalReceived(sourceChain, sourceAddress);
    }
}