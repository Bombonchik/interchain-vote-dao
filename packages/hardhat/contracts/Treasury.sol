//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;


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
