//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title MockWormholeRelayer
 * @notice A fake Wormhole Relayer for local testing only.
 */
contract MockWormholeRelayer {
    
    // Returns a fixed price of 0.01 ETH for testing
    function quoteEVMDeliveryPrice(
        uint16 /*targetChain*/,
        uint256 /*receiverValue*/,
        uint256 /*gasLimit*/
    ) external pure returns (uint256 nativePriceQuote, uint256 deliveryFee) {
        return (0.01 ether, 0);
    }

    // Pretends to send the payload
    function sendPayloadToEvm(
        uint16 /*targetChain*/,
        address /*targetAddress*/,
        bytes memory /*payload*/,
        uint256 /*receiverValue*/,
        uint256 /*gasLimit*/
    ) external payable returns (uint64 sequence) {
        return 1; // Return a dummy sequence number
    }
}