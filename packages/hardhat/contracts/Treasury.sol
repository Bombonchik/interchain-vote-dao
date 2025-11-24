//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

<<<<<<< HEAD

contract Treasury {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function executeProposal(address target, uint256 value, bytes calldata data) external {
        // Only owner for now
        require(msg.sender == owner, "Not owner");
        (bool success, ) = target.call{value: value}(data);
        require(success, "Execution failed");
    }

    receive() external payable {}
}
=======
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Treasury
 * @notice Holds funds and executes proposals on Sepolia (Chain A).
 * @dev This contract is controlled by the Receiver contract (and the owner for setup).
 */
contract Treasury is Ownable {
    
    // The address of the Wormhole Receiver contract that is allowed to call us.
    address public receiver;

    event ReceiverSet(address indexed newReceiver);
    event ProposalExecuted(address indexed target, uint256 value, bytes data);
    event Received(address, uint256);

    // Set the deployer as the initial owner
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Sets the trusted Receiver contract address.
     * @dev Only the owner (deployer) can call this. We call this once after deploying Receiver.
     */
    function setReceiver(address _receiver) external onlyOwner {
        require(_receiver != address(0), "Treasury: Receiver cannot be zero address");
        receiver = _receiver;
        emit ReceiverSet(_receiver);
    }

    /**
     * @notice Executes a transaction passed from the DAO.
     * @dev Can ONLY be called by the trusted Receiver contract.
     */
    function executeProposal(
        address target,
        uint256 value,
        bytes calldata data
    ) external {
        require(msg.sender == receiver, "Treasury: Only Receiver can execute");

        // Perform the low-level call to the target contract/address
        (bool success, ) = target.call{value: value}(data);
        require(success, "Treasury: Proposal execution failed");

        emit ProposalExecuted(target, value, data);
    }

    /**
     * @notice Allows the contract to receive ETH.
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
>>>>>>> origin/main
