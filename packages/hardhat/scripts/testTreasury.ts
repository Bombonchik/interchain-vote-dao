import { ethers } from "hardhat";
import { Treasury } from "../typechain-types";
import { parseEther, formatEther } from "ethers";

async function main() {
  // Get Signers
  const [deployer, fakeReceiver, targetWallet, unauthorizedUser] = await ethers.getSigners();

  console.log("--------------------------------------------------");
  console.log("🧪 Starting Treasury Logic Tests");
  console.log("--------------------------------------------------");
  console.log("Deployer:", deployer.address);
  console.log("Fake Receiver (simulating Wormhole Receiver):", fakeReceiver.address);
  console.log("Target Wallet (recipient of funds):", targetWallet.address);

  // Deploy Treasury
  const treasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = (await treasuryFactory.deploy()) as Treasury;
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();

  console.log("✅ Treasury deployed at:", treasuryAddress);

  // Fund the Treasury
  // We send 10 ETH to the Treasury so it has something to spend
  const fundingTx = await deployer.sendTransaction({
    to: treasuryAddress,
    value: parseEther("10.0"),
  });
  await fundingTx.wait();

  const balance = await ethers.provider.getBalance(treasuryAddress);
  console.log("💰 Treasury Balance:", formatEther(balance), "ETH");

  // Set the Trusted Receiver
  // Only the owner (deployer) should be able to do this
  console.log("...Setting trusted receiver...");
  const setReceiverTx = await treasury.setReceiver(fakeReceiver.address);
  await setReceiverTx.wait();
  console.log("✅ Trusted Receiver set to:", await treasury.receiver());

  // Test: Execute Proposal (Happy Path)
  // The Fake Receiver tells the Treasury to send 2 ETH to the Target Wallet
  console.log("...Attempting execution from Trusted Receiver...");

  const amountToSend = parseEther("2.0");
  const initialTargetBalance = await ethers.provider.getBalance(targetWallet.address);

  // We simulate the call that the real Receiver.sol would make
  const executeTx = await treasury.connect(fakeReceiver).executeProposal(
    targetWallet.address, // Target
    amountToSend, // Value
    "0x", // Data (empty for simple ETH transfer)
  );
  await executeTx.wait();

  const finalTargetBalance = await ethers.provider.getBalance(targetWallet.address);
  console.log("✅ Execution Successful!");
  console.log("   Target Balance Change:", formatEther(finalTargetBalance - initialTargetBalance), "ETH");

  // Test: Security Check (Unhappy Path)
  // An unauthorized user tries to call executeProposal. This must fail.
  console.log("...Attempting execution from Unauthorized User (Should Fail)...");

  try {
    await treasury.connect(unauthorizedUser).executeProposal(targetWallet.address, parseEther("1.0"), "0x");

    console.error("❌ SECURITY FAILED: Unauthorized user was able to execute!");
    process.exit(1);
  } catch (error: any) {
    // We expect an error here.
    if (error.message.includes("Treasury: Only Receiver can execute")) {
      console.log("✅ Security Passed: Transaction reverted with correct error message.");
    } else {
      console.log("✅ Security Passed: Transaction reverted as expected.");
    }
  }

  console.log("--------------------------------------------------");
  console.log("🎉 All Treasury tests passed!");
  console.log("--------------------------------------------------");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
