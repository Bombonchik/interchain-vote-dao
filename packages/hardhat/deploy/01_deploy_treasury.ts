import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the Treasury contract.
 * This script is intended to be run on Sepolia (Chain A).
 */
const deployTreasury: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // --- NETWORK CHECK ---
  // We only want to deploy Treasury (Chain A contract) to sepolia or localhost.
  const isTargetNetwork = hre.network.name === "sepolia" || hre.network.name === "localhost";

  if (!isTargetNetwork) {
    console.log(`Skipping deploy of Treasury on network: ${hre.network.name}. Not Sepolia or localhost.`);
    return;
  }
  // --- END NETWORK CHECK ---

  await deploy("Treasury", {
    from: deployer,
    args: [], // Constructor takes no args
    log: true,
    autoMine: true,
  });

  const treasury = await hre.ethers.getContract<Contract>("Treasury", deployer);
  console.log("✅ Treasury deployed to:", await treasury.getAddress(), "on network:", hre.network.name);
};

export default deployTreasury;

deployTreasury.tags = ["Treasury", "ChainA"];
