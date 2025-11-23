import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

const deployVoter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Only run on Base Sepolia
  const isTargetNetwork = hre.network.name === "baseSepolia" || hre.network.name === "localhost";
  if (!isTargetNetwork) return;

  // Get the DAOToken
  const daoToken = await hre.ethers.getContract<Contract>("DAOToken", deployer);
  const daoTokenAddress = await daoToken.getAddress();

  // Wormhole Relayer Address on Base Sepolia
  // See: https://wormhole.com/docs/products/reference/contract-addresses/#__tabbed_3_2
  const WORMHOLE_RELAYER_BASE_SEPOLIA = "0x93BAD53DDfB6132b0aC8E37f6029163E63372cEE";

  await deploy("Voter", {
    from: deployer,
    args: [daoTokenAddress, WORMHOLE_RELAYER_BASE_SEPOLIA],
    log: true,
    autoMine: true,
  });

  const voter = await hre.ethers.getContract<Contract>("Voter", deployer);
  console.log("✅ Voter deployed to:", await voter.getAddress());
};

export default deployVoter;
deployVoter.tags = ["Voter", "ChainB"];
