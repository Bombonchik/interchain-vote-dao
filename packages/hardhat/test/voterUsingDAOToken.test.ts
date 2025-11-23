import { expect } from "chai";
import { ethers } from "hardhat";
import { DAOToken, Voter, MockWormholeEmitter } from "../typechain-types";

describe("Voter.sol with existing DAOToken", function () {
  it("create proposal, vote, finalize → wormhole payload", async function () {
    const [deployer, alice, bob] = await ethers.getSigners();

    // Use deployed DAOToken address (localhost)
    const tokenAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    // Correct typed instance
    const DAOToken = (await ethers.getContractAt("DAOToken", tokenAddress)) as unknown as DAOToken;

    // Mint tokens
    await DAOToken.mint(alice.address, ethers.parseEther("1000"));
    await DAOToken.mint(bob.address, ethers.parseEther("1000"));

    // Self-delegate (ethers v6 syntax)
    await DAOToken.connect(alice).delegate(alice.address);
    await DAOToken.connect(bob).delegate(bob.address);

    // Deploy MockWormholeEmitter
    const MockWormhole = await ethers.getContractFactory("MockWormholeEmitter");
    const wormhole = (await MockWormhole.deploy()) as MockWormholeEmitter;
    await wormhole.waitForDeployment();

    // Deploy Voter.sol
    const VoterFactory = await ethers.getContractFactory("Voter");
    const voter = (await VoterFactory.deploy(
      tokenAddress,
      await wormhole.getAddress(),
      1, // votingDelay
      5, // votingPeriod
      1,
      100, // quorum 1%
      1,
      2, // threshold 50%
    )) as Voter;
    await voter.waitForDeployment();

    // Create a proposal
    const tx = await voter.connect(deployer).createProposal(deployer.address, 0, "0x", "Test Proposal");

    const rc = await tx.wait();
    const event = rc?.logs
      .map((log: any) => voter.interface.parseLog(log))
      .find((e: any) => e?.name === "ProposalCreated");

    const proposalId = event?.args.id;

    // Mine one block to start voting
    await ethers.provider.send("evm_mine", []);

    // Vote: true = For, false = Against
    await voter.connect(alice).castVote(proposalId, true);
    await voter.connect(bob).castVote(proposalId, false);

    // Mine enough blocks
    for (let i = 0; i < 6; i++) {
      await ethers.provider.send("evm_mine", []);
    }

    // Finalize proposal
    const nonce = 1;
    await voter.connect(deployer).finalizeProposal(proposalId, nonce);

    // Read emitted payload from mock wormhole
    const lastPayload = await wormhole.lastPayload();

    // Decode payload using ethers v6
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256", "address", "uint256", "bytes"], lastPayload);

    expect(Number(decoded[0])).to.equal(Number(proposalId));
    expect(decoded[1]).to.equal(deployer.address);
    expect(Number(decoded[2])).to.equal(0);
    expect(decoded[3]).to.equal("0x");
  });
});
