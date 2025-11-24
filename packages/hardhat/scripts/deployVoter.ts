import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Voter.sol with account:", deployer.address);

  // Replace these with your deployed DAOToken addresses
  const DAOTokenAddresses: Record<string, string> = {
    localhost: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    baseSepolia: "0xBDC24822acE5AC820789bE8866F67dc1361aD76A",
  };

  // Detect network
  const network = (await ethers.provider.getNetwork()).name;
  const tokenAddress = network === "hardhat" ? DAOTokenAddresses.localhost : DAOTokenAddresses.baseSepolia;

  console.log("Using DAOToken at:", tokenAddress, "on network:", network);

  // Deploy MockWormholeEmitter (or real Wormhole later)
  const MockWormhole = await ethers.getContractFactory("MockWormholeEmitter");
  const wormhole = await MockWormhole.deploy();
  await wormhole.deployed();
  console.log("MockWormholeEmitter deployed at:", wormhole.address);

  // Deploy Voter.sol
  const Voter = await ethers.getContractFactory("Voter");
  const voter = await Voter.deploy(
    tokenAddress,
    wormhole.address,
    1, // votingDelay (blocks)
    10, // votingPeriod (blocks)
    1,
    100, // quorum: 1%
    1,
    2, // threshold: 50%
  );

  await voter.deployed();
  console.log("Voter.sol deployed at:", voter.address);

  // Optional: save addresses for frontend
  console.log("Voter and Wormhole addresses ready for frontend integration.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
