import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { ethers } from "hardhat";

const deployReceiver: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Only run on Sepolia
  const isTargetNetwork = hre.network.name === "sepolia" || hre.network.name === "localhost";
  if (!isTargetNetwork) return;

  // Get the Treasury (Chain A)
  const treasury = await hre.ethers.getContract<Contract>("Treasury", deployer);
  const treasuryAddress = await treasury.getAddress();

  const VOTER_ADDRESS_BASE_SEPOLIA = "0x82A1c924FBbC6c09b5431d99931b423AD1A43384";

  // Convert address to bytes32 (Wormhole format)
  // This pads the 20-byte address with zeros to make it 32 bytes
  const authorizedEmitter = ethers.zeroPadValue(VOTER_ADDRESS_BASE_SEPOLIA, 32);

  // Wormhole Relayer on Sepolia
  const WORMHOLE_RELAYER_SEPOLIA = "0x7b1bd7a6b4e61c2a123f6cb2dc53182f64f543fd";

  await deploy("Receiver", {
    from: deployer,
    args: [WORMHOLE_RELAYER_SEPOLIA, treasuryAddress, authorizedEmitter],
    log: true,
    autoMine: true,
  });

  const receiver = await hre.ethers.getContract<Contract>("Receiver", deployer);
  const receiverAddress = await receiver.getAddress();
  console.log("✅ Receiver deployed to:", receiverAddress);

  // Tell Treasury to trust this Receiver
  console.log("...Setting Treasury permission...");
  try {
    const setReceiverTx = await treasury.setReceiver(receiverAddress);
    await setReceiverTx.wait();
    console.log("✅ Treasury now trusts Receiver!");
  } catch (e) {
    const unknownError = e as Error;
    console.log(`⚠️ Could not set Treasury permission automatically. ${unknownError.message}`);
  }
};

export default deployReceiver;
deployReceiver.tags = ["Receiver", "ChainA"];
