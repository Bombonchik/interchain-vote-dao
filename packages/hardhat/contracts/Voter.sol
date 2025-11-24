//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

<<<<<<< HEAD

import "./DAOToken.sol";

contract Voter {
    DAOToken public token;

    struct Proposal {
        address target;
        uint256 value;
        bytes data;
        string description;
        bool executed;
        uint256 forVotes;
        uint256 againstVotes;
    }

    Proposal[] public proposals;

    constructor(address tokenAddress) {
        token = DAOToken(tokenAddress);
    }

    function createProposal(address target, uint256 value, bytes calldata data, string calldata description) external returns (uint256) {
        proposals.push(Proposal(target, value, data, description, false, 0, 0));
        return proposals.length - 1;
    }

    function castVote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        uint256 votes = token.getPastVotes(msg.sender, block.number - 1);
        require(votes > 0, "No voting power");
        if (support) {
            p.forVotes += votes;
        } else {
            p.againstVotes += votes;
        }
    }

    function finalizeProposal(uint256 proposalId, uint256 /*nonce*/) external {
        Proposal storage p = proposals[proposalId];
        p.executed = true;
        // Normally you would emit a Wormhole payload here
    }
}

=======
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Minimal Wormhole Relayer Interface
interface IWormholeRelayer {
    function quoteEVMDeliveryPrice(
        uint16 targetChain,
        uint256 receiverValue,
        uint256 gasLimit
    ) external view returns (uint256 nativePriceQuote, uint256 deliveryFee);

    function sendPayloadToEvm(
        uint16 targetChain,
        address targetAddress,
        bytes memory payload,
        uint256 receiverValue,
        uint256 gasLimit
    ) external payable returns (uint64 sequence);
}

/**
 * @title Voter
 * @notice Manages proposals on Base Sepolia and sends results to Sepolia via Wormhole.
 */
contract Voter is Ownable {
    
    // --- Constants ---
    // Wormhole Chain ID for Sepolia (Chain A)
    uint16 private constant SEPOLIA_WORMHOLE_CHAIN_ID = 10002;
    // Gas limit for the execution on the destination chain
    uint256 private constant DESTINATION_GAS_LIMIT = 300000; 

    // SECURITY: Minimum allowed voting period (~30 seconds on Base)
    // This prevents the owner from setting a period that is too short to react to.
    uint256 public constant MIN_VOTING_PERIOD_BLOCKS = 15;

    // --- State ---
    IVotes public immutable daoToken;
    IWormholeRelayer public immutable wormholeRelayer;
    
    // We set this after deploying the Receiver on Sepolia
    address public receiverAddress; 

    struct Proposal {
        uint256 id;
        string description;
        uint256 snapshotBlock;
        uint256 votingPeriodEndBlock;
        uint256 forVotes;
        uint256 againstVotes;
        address target;
        uint256 value;
        bytes calldataPayload;
        bool executed;
        bool exists;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    uint256 public nextProposalId = 1;

    // Default to the minimum (15 blocks), but can be increased
    uint256 public votingPeriodBlocks = 15; 

    event ProposalCreated(uint256 indexed id, string description);
    event VoteCast(uint256 indexed id, address indexed voter, uint256 power, bool support);
    event ProposalExecuted(uint256 indexed id);
    event ReceiverSet(address indexed newReceiver);
    event VotingPeriodUpdated(uint256 newPeriod);

    /**
     * @param _daoTokenAddress The address of your DAOToken on Base Sepolia
     * @param _wormholeRelayerAddress The official Wormhole Relayer on Base Sepolia
     */
    constructor(address _daoTokenAddress, address _wormholeRelayerAddress) Ownable(msg.sender) {
        daoToken = IVotes(_daoTokenAddress);
        wormholeRelayer = IWormholeRelayer(_wormholeRelayerAddress);
    }

    // --- Configuration ---

    function setReceiver(address _receiver) external onlyOwner {
        receiverAddress = _receiver;
        emit ReceiverSet(_receiver);
    }

    function setVotingPeriod(uint256 _blocks) external onlyOwner {
        require(_blocks >= MIN_VOTING_PERIOD_BLOCKS, "Period is too short (security risk)");
        votingPeriodBlocks = _blocks;
        emit VotingPeriodUpdated(_blocks);
    }

    // --- DAO Logic ---

    function createProposal(
        address _target,
        uint256 _value,
        bytes calldata _calldata,
        string calldata _description
    ) external {
        // Snapshot block is the current block
        uint256 snapshot = block.number;
        
        Proposal storage p = proposals[nextProposalId];
        p.id = nextProposalId;
        p.description = _description;
        p.snapshotBlock = snapshot;
        p.votingPeriodEndBlock = snapshot + votingPeriodBlocks;
        p.target = _target;
        p.value = _value;
        p.calldataPayload = _calldata;
        p.exists = true;

        emit ProposalCreated(nextProposalId, _description);
        nextProposalId++;
    }

    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage p = proposals[_proposalId];
        require(p.exists, "Voter: Proposal does not exist");
        require(block.number <= p.votingPeriodEndBlock, "Voter: Voting period ended");
        require(!hasVoted[_proposalId][msg.sender], "Voter: Already voted");

        // Get voting power using the historical token balance at the snapshot block
        uint256 votePower = daoToken.getPastVotes(msg.sender, p.snapshotBlock);
        require(votePower > 0, "Voter: No voting power");

        if (_support) {
            p.forVotes += votePower;
        } else {
            p.againstVotes += votePower;
        }

        hasVoted[_proposalId][msg.sender] = true;
        emit VoteCast(_proposalId, msg.sender, votePower, _support);
    }

    function finalizeAndSend(uint256 _proposalId) external payable {
        Proposal storage p = proposals[_proposalId];
        require(p.exists, "Voter: Proposal does not exist");
        require(block.number > p.votingPeriodEndBlock, "Voter: Voting is still open");
        require(!p.executed, "Voter: Proposal already executed");
        require(p.forVotes > p.againstVotes, "Voter: Proposal failed to pass");
        require(receiverAddress != address(0), "Voter: Receiver not set");

        p.executed = true;

        // Encode payload: [target, value, data]
        bytes memory payload = abi.encode(
            p.target,
            p.value,
            p.calldataPayload
        );

        (uint256 nativePriceQuote, ) = wormholeRelayer.quoteEVMDeliveryPrice(
            SEPOLIA_WORMHOLE_CHAIN_ID,
            0, // Receiver value (we aren't sending ETH to the receiver contract itself to keep)
            DESTINATION_GAS_LIMIT
        );

        require(msg.value >= nativePriceQuote, "Voter: Insufficient ETH sent for gas fee");

        // Send
        wormholeRelayer.sendPayloadToEvm{value: nativePriceQuote}(
            SEPOLIA_WORMHOLE_CHAIN_ID,
            receiverAddress,
            payload,
            0, // Receiver Value
            DESTINATION_GAS_LIMIT
        );

        // Refund excess ETH to the user
        uint256 refund = msg.value - nativePriceQuote;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }

        emit ProposalExecuted(_proposalId);
    }
}
>>>>>>> origin/main
