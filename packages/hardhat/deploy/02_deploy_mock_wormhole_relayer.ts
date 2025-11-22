import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

const deployMockWormholeRelayer: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const isTargetNetwork = hre.network.name === "localhost";
  if (!isTargetNetwork) return;

  await deploy("MockWormholeRelayer", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
  });

  const mockWormholeRelayer = await hre.ethers.getContract<Contract>("MockWormholeRelayer", deployer);
  console.log("✅ MockWormholeRelayer deployed to:", await mockWormholeRelayer.getAddress());
};

export default deployMockWormholeRelayer;
deployMockWormholeRelayer.tags = ["MockWormholeRelayer", "ChainB"];
