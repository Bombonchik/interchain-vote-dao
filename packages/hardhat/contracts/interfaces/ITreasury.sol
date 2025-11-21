//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;


/**
 * @title ITreasury
 * @notice Interface for the Treasury contract (deployed on Sepolia/Chain A).
 * @dev This is used by the Receiver.sol on Sepolia and referenced by the Voter.sol on Base Sepolia.
 * It defines the function signature the DAO proposals must target.
 */
interface ITreasury {
    /**
     * @notice Executes a proposal by making a low-level call. Only callable by the Receiver.sol.
     * @param target The address of the contract/EOA to call (e.g., recipient of ETH).
     * @param value The amount of ETH (in wei) to send with the call.
     * @param data The calldata payload to send with the call.
     */
    function executeProposal(
        address target,
        uint256 value,
        bytes calldata data
    ) external;
}