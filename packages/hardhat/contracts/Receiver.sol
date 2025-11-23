//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;


import "./Treasury.sol";

contract Receiver {
    Treasury public treasury;

    constructor(address treasuryAddress) {
        treasury = Treasury(treasuryAddress);
    }

    function receiveAndExecute(address target, uint256 value, bytes calldata data) external {
        // In real scenario, you would validate Wormhole payload
        treasury.executeProposal(target, value, data);
    }
}
