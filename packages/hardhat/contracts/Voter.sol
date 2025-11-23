//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;


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

