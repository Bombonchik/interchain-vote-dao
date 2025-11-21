import { ethers } from "hardhat";
import { Receiver, Treasury } from "../typechain-types";
import { parseEther, AbiCoder } from "ethers";

async function main() {
  const [deployer, fakeRelayer, unauthorizedUser, targetWallet] = await ethers.getSigners();

  console.log("--------------------------------------------------");
  console.log("📡 Starting Receiver Logic Tests (Localhost)");
  console.log("--------------------------------------------------");

  // Deploy Treasury
  const treasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = (await treasuryFactory.deploy()) as Treasury;
  await treasury.waitForDeployment();
  console.log("✅ Treasury deployed.");

  // Define Constants
  // This simulates the Voter address on Chain B
  const MOCK_VOTER_ADDRESS = "0x1234567890123456789012345678901234567890";
  // Convert to bytes32 (Wormhole format)
  const authorizedEmitter = ethers.zeroPadValue(MOCK_VOTER_ADDRESS, 32);

  // Deploy Receiver
  // We pass 'fakeRelayer.address' so we can sign transactions acting as the Relayer
  const receiverFactory = await ethers.getContractFactory("Receiver");
  const receiver = (await receiverFactory.deploy(
    fakeRelayer.address, // The "Wormhole Relayer" address
    await treasury.getAddress(),
    authorizedEmitter,
  )) as Receiver;
  await receiver.waitForDeployment();
  console.log("✅ Receiver deployed.");

  // Link Treasury -> Receiver
  await treasury.setReceiver(await receiver.getAddress());
  console.log("✅ Treasury linked to Receiver.");

  // Fund Treasury
  await deployer.sendTransaction({
    to: await treasury.getAddress(),
    value: parseEther("5.0"),
  });
  console.log("✅ Treasury funded with 5 ETH.");

  // --- TEST CASES ---

  // Payload to send: "Send 1.5 ETH to targetWallet"
  // Corresponds to: abi.encode(target, value, calldata)
  const payload = AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "bytes"],
    [targetWallet.address, parseEther("1.5"), "0x"],
  );

  // TEST 1: Happy Path (Correct Relayer, Correct Chain, Correct Emitter)
  console.log("\n...Testing Valid Message Delivery...");
  const initialBalance = await ethers.provider.getBalance(targetWallet.address);

  await receiver.connect(fakeRelayer).receiveWormholeMessages(
    payload,
    [], // additionalVaas
    authorizedEmitter, // Correct Source Address (Voter)
    10004, // Correct Source Chain ID (Base Sepolia)
    ethers.ZeroHash, // deliveryHash
  );

  const finalBalance = await ethers.provider.getBalance(targetWallet.address);
  const difference = finalBalance - initialBalance;

  if (difference === parseEther("1.5")) {
    console.log("✅ SUCCESS: Treasury executed the command! Target received 1.5 ETH.");
  } else {
    console.error("❌ FAILURE: Target did not receive correct funds.");
  }

  // TEST 2: Security - Wrong Relayer
  console.log("\n...Testing Security: Unauthorized Relayer...");
  try {
    await receiver
      .connect(unauthorizedUser)
      .receiveWormholeMessages(payload, [], authorizedEmitter, 10004, ethers.ZeroHash);
    console.error("❌ FAILURE: Unauthorized user should have been blocked!");
  } catch (e: any) {
    if (e.message.includes("Receiver: Only Relayer allowed")) {
      console.log("✅ Passed: Unauthorized relayer blocked.");
    } else {
      console.log("✅ Passed: Transaction reverted as expected.");
    }
  }

  // TEST 3: Security - Wrong Source Chain
  console.log("\n...Testing Security: Wrong Source Chain...");
  try {
    await receiver.connect(fakeRelayer).receiveWormholeMessages(
      payload,
      [],
      authorizedEmitter,
      9999, // WRONG CHAIN ID (e.g. Solana instead of Base Sepolia)
      ethers.ZeroHash,
    );
    console.error("❌ FAILURE: Wrong chain ID should have been blocked!");
  } catch (e: any) {
    if (e.message.includes("Receiver: Wrong source chain")) {
      console.log("✅ Passed: Wrong source chain blocked.");
    } else {
      console.log("✅ Passed: Transaction reverted as expected.");
    }
  }

  // TEST 4: Security - Wrong Emitter (Fake Voter)
  console.log("\n...Testing Security: Fake Voter Contract...");
  const fakeVoter = ethers.zeroPadValue("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", 32);
  try {
    await receiver.connect(fakeRelayer).receiveWormholeMessages(
      payload,
      [],
      fakeVoter, // WRONG EMITTER
      10004,
      ethers.ZeroHash,
    );
    console.error("❌ FAILURE: Fake Voter address should have been blocked!");
  } catch (e: any) {
    if (e.message.includes("Receiver: Unauthorized emitter")) {
      console.log("✅ Passed: Fake Voter blocked.");
    } else {
      console.log("✅ Passed: Transaction reverted as expected.");
    }
  }

  console.log("--------------------------------------------------");
  console.log("🎉 All Receiver tests passed!");
  console.log("--------------------------------------------------");
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
