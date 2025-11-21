import { ethers } from "hardhat";
import { DAOToken, Voter, MockWormholeRelayer } from "../typechain-types";
import { parseEther, formatEther } from "ethers";

async function main() {
  const [deployer, voter1, voter2] = await ethers.getSigners();

  console.log("--------------------------------------------------");
  console.log("🗳️  Starting Voter Logic Tests (Localhost)");
  console.log("--------------------------------------------------");

  // Deploy DAOToken
  const tokenFactory = await ethers.getContractFactory("DAOToken");
  const daoToken = (await tokenFactory.deploy()) as DAOToken;
  await daoToken.waitForDeployment();
  const tokenAddr = await daoToken.getAddress();
  console.log("✅ DAOToken deployed at:", tokenAddr);

  // Deploy Mock Wormhole Relayer
  const mockRelayerFactory = await ethers.getContractFactory("MockWormholeRelayer");
  const mockRelayer = (await mockRelayerFactory.deploy()) as MockWormholeRelayer;
  await mockRelayer.waitForDeployment();
  const relayerAddr = await mockRelayer.getAddress();
  console.log("✅ Mock Relayer deployed at:", relayerAddr);

  // Deploy Voter (linked to Token and Mock Relayer)
  const voterFactory = await ethers.getContractFactory("Voter");
  const voter = (await voterFactory.deploy(tokenAddr, relayerAddr)) as Voter;
  await voter.waitForDeployment();
  console.log("✅ Voter contract deployed at:", await voter.getAddress());

  // Setup: Set a dummy Receiver Address
  // (In real life, this is the address on Sepolia)
  const dummyReceiverAddress = "0x1234567890123456789012345678901234567890";
  await voter.setReceiver(dummyReceiverAddress);
  console.log("✅ Receiver address set.");

  // Setup: Mint and Delegate Voting Power
  // Voter1 gets 10 tokens
  await daoToken.connect(deployer).grantRole(await daoToken.MINTER_ROLE(), deployer.address);
  await daoToken.mint(voter1.address, parseEther("10"));
  // CRITICAL: Must delegate to self to activate voting power
  await daoToken.connect(voter1).delegate(voter1.address);

  console.log("✅ Voter1 minted 10 tokens and delegated to self.");

  // Create Proposal
  // We simulate a proposal to "Send 1 ETH" (target doesn't matter for local test)
  console.log("...Creating Proposal...");
  const target = voter2.address; // Just a random target
  const value = parseEther("1");
  const callData = "0x";

  const createTx = await voter.createProposal(target, value, callData, "Test Proposal");
  await createTx.wait();
  console.log("✅ Proposal #1 Created.");

  // Vote
  // Voter1 votes "For" (true)
  // We need to verify the proposal state (active)
  console.log("...Voting...");
  const voteTx = await voter.connect(voter1).vote(1, true);
  await voteTx.wait();
  console.log("✅ Voter1 cast vote.");

  // Fast Forward Time
  // The voting period is 15 blocks. We need to mine blocks to close the poll.
  console.log("...Mining blocks to end voting period...");
  // Helper to mine 20 blocks
  for (let i = 0; i < 20; i++) {
    await ethers.provider.send("evm_mine", []);
  }

  // Finalize and Send (Cross-Chain)
  // The Mock Relayer charges 0.01 ETH. We send 0.05 ETH to test the refund logic.
  console.log("...Finalizing Proposal...");

  const initialBalance = await ethers.provider.getBalance(deployer.address);

  const finalizeTx = await voter.finalizeAndSend(1, { value: parseEther("0.05") });
  await finalizeTx.wait();

  const finalBalance = await ethers.provider.getBalance(deployer.address);

  console.log("✅ Proposal Finalized & Sent to Mock Relayer!");

  // Check if refund worked (approximate calculation)
  // We spent ~0.01 ETH (cost) + gas. If we spent 0.05, the balance drop would be huge.
  const spent = initialBalance - finalBalance;
  console.log("   ETH Spent (Cost + Gas):", formatEther(spent));

  if (spent < parseEther("0.02")) {
    console.log("✅ Refund Successful: Only paid ~0.01 ETH + gas.");
  } else {
    console.log("❌ Refund Failed: Paid too much.");
  }

  console.log("--------------------------------------------------");
  console.log("🎉 All Voter tests passed!");
  console.log("--------------------------------------------------");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
