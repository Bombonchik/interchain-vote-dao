import { ethers } from "hardhat";
import { DAOToken } from "../typechain-types";

const MINT_VALUE = ethers.parseEther("20");

async function main() {
  // 1. Get Signers
  const [deployer, account1, account2] = await ethers.getSigners();

  console.log("Deploying contract with the account:", deployer.address);

  // 2. Deploy Contract
  const daoTokenFactory = await ethers.getContractFactory("DAOToken");
  // We cast to the specific DAOToken type on deploy
  const daoTokenContract = (await daoTokenFactory.deploy()) as DAOToken;

  await daoTokenContract.waitForDeployment();

  const contractAddress = await daoTokenContract.getAddress();
  console.log(`DAOToken contract deployed at ${contractAddress}`);

  const initTotalSupply = await daoTokenContract.totalSupply();
  console.log({ initTotalSupply: initTotalSupply.toString() });

  // 3. Mint Tokens
  const mintTokensTx = await daoTokenContract.mint(account1.address, MINT_VALUE);
  await mintTokensTx.wait(); // Wait for transaction receipt
  console.log(`Minted ${MINT_VALUE.toString()} decimal units to account ${account1.address}\n`);
  const balanceBN = await daoTokenContract.balanceOf(account1.address);
  console.log(`Account ${account1.address} has ${balanceBN.toString()} decimal units of DAOToken\n`);

  // 4. Check Votes Before Delegation
  const votes = await daoTokenContract.getVotes(account1.address);
  console.log(`Account ${account1.address} has ${votes.toString()} units of voting power before self delegating\n`);

  // 5. Self-Delegate
  // We need to connect the contract to the 'account1' signer to send a tx from their address
  const delegateTx = await daoTokenContract.connect(account1).delegate(account1.address);
  await delegateTx.wait();
  const votesAfter = await daoTokenContract.getVotes(account1.address);
  console.log(`Account ${account1.address} has ${votesAfter.toString()} units of voting power after self delegating\n`);

  // 6. Transfer Tokens
  const transferTx = await daoTokenContract.connect(account1).transfer(account2.address, MINT_VALUE / 2n);
  await transferTx.wait();

  const votes1AfterTransfer = await daoTokenContract.getVotes(account1.address);
  console.log(
    `Account ${account1.address} has ${votes1AfterTransfer.toString()} units of voting power after transferring\n`,
  );
  const votes2AfterTransfer = await daoTokenContract.getVotes(account2.address);
  console.log(
    `Account ${
      account2.address
    } has ${votes2AfterTransfer.toString()} units of voting power after receiving a transfer\n`,
  );

  // 7. Mint to Account 2
  const mintTokens2Tx = await daoTokenContract.mint(account2.address, MINT_VALUE);
  await mintTokens2Tx.wait();

  // 8. Check Past Votes (Snapshotting)
  const lastBlockNumber = await ethers.provider.getBlockNumber();
  console.log(`Current Block Number: ${lastBlockNumber}`);

  // Loop from the block before the last mint
  // Use BigInts for the loop
  for (let index = BigInt(lastBlockNumber - 1); index >= 0n; index--) {
    const pastVotes = await daoTokenContract.getPastVotes(account1.address, index);
    console.log(`Account ${account1.address} had ${pastVotes.toString()} units of voting power at block ${index}\n`);
    // Break after a few blocks for readability
    if (BigInt(lastBlockNumber) - index > 5n) break;
  }

  console.log(`\n\n`);

  // 9. Grant Role
  const code = await daoTokenContract.MINTER_ROLE();
  const roleTx = await daoTokenContract.grantRole(code, account2.address);
  await roleTx.wait();

  // 10. Test New Minter (Account 2 mints to Deployer)
  const mintTx = await daoTokenContract.connect(account2).mint(deployer.address, ethers.parseEther("10"));
  await mintTx.wait();
  console.log("✅ Account 2 successfully used MINTER_ROLE.");

  // 11. Log Token Info
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    daoTokenContract.name(),
    daoTokenContract.symbol(),
    daoTokenContract.decimals(),
    daoTokenContract.totalSupply(),
  ]);
  console.log({
    name,
    symbol,
    decimals, // Decimals is a number, no toString() needed
    totalSupply: totalSupply.toString(),
  });

  // 12. Final Balance Check
  const tx = await daoTokenContract.transfer(account1.address, ethers.parseEther("2"));
  await tx.wait();

  const myBalance = await daoTokenContract.balanceOf(deployer.address);

  console.log(`Deployer Balance is ${ethers.formatEther(myBalance)} decimal units`);
  const otherBalance = await daoTokenContract.balanceOf(account1.address);
  console.log(`Account 1 Balance is ${ethers.formatEther(otherBalance)} decimal units`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
