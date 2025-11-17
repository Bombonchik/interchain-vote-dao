import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the DAOToken contract.
 * This script is intended to be run on Base Sepolia (Chain B).
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployDAOToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    On localhost, the deployer account is the one that comes with Hardhat, which is already funded.

    When deploying to live networks (e.g `yarn deploy --network baseSepolia`), the deployer account
    should have sufficient balance to pay for the gas fees for contract creation.
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // --- NETWORK CHECK ---
  // We only want to deploy DAOToken (Chain B contract) to baseSepolia or localhost.
  const isTargetNetwork = hre.network.name === "baseSepolia" || hre.network.name === "localhost";

  if (!isTargetNetwork) {
    console.log(`Skipping deploy of DAOToken on network: ${hre.network.name}. Not Base Sepolia or localhost.`);
    return;
  }
  // --- END NETWORK CHECK ---

  // We are deploying DAOToken
  await deploy("DAOToken", {
    from: deployer,
    // Contract constructor arguments
    // Our DAOToken constructor() takes no arguments.
    args: [],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });

  // Get the deployed contract to interact with it after deploying.
  const daoToken = await hre.ethers.getContract<Contract>("DAOToken", deployer);
  console.log("✅ DAOToken (WGT) deployed to:", await daoToken.getAddress(), "on network:", hre.network.name);
};

export default deployDAOToken;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags DAOToken
deployDAOToken.tags = ["DAOToken", "ChainB"];
