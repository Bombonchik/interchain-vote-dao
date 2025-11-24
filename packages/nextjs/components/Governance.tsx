"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import deployedContracts from "../contracts/deployedContracts";
import {
  Address,
  decodeFunctionData,
  encodeFunctionData,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";

// --- HELPERS ---
const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const decodeTransfer = (calldata: `0x${string}`) => {
  try {
    if (!calldata || calldata === "0x" || calldata.length < 10) return null;
    const decoded = decodeFunctionData({ abi: erc20Abi, data: calldata });
    if (decoded.functionName === "transfer") {
      const [to, amount] = decoded.args;
      return { to, amount: formatUnits(amount, 6) };
    }
  } catch (e) {
    console.error("Failed to decode calldata", e);
  }
  return null;
};

export const Governance = () => {
  const { address: userAddress, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // 1. SMART BLOCK TIMER
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const CHAIN_ID_BASE_SEPOLIA = 84532;
  const isOnBase = chainId === CHAIN_ID_BASE_SEPOLIA;

  const contracts = deployedContracts;
  const baseContracts = contracts[CHAIN_ID_BASE_SEPOLIA];

  const voterAddress = baseContracts?.Voter?.address;
  const daoTokenAddress = baseContracts?.DAOToken?.address;
  const voterAbi = baseContracts?.Voter?.abi;
  const tokenAbi = baseContracts?.DAOToken?.abi;

  const [description, setDescription] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [assetType, setAssetType] = useState<"ETH" | "USDC">("ETH");
  const [voteError, setVoteError] = useState<string | null>(null);

  // --- DATA HOOKS ---
  const { data: votingPeriodBlocks } = useReadContract({
    address: voterAddress,
    abi: voterAbi,
    functionName: "votingPeriodBlocks",
  });

  const { data: votingPower, refetch: refetchVotingPower } = useReadContract({
    address: daoTokenAddress,
    abi: tokenAbi,
    functionName: "getVotes",
    args: [userAddress as Address],
    query: { enabled: !!userAddress },
  });

  const { data: nextProposalId, refetch: refetchId } = useReadContract({
    address: voterAddress,
    abi: voterAbi,
    functionName: "nextProposalId",
  });

  const proposalIds = useMemo(() => {
    if (!nextProposalId) return [];
    const ids = [];
    for (let i = 1; i < Number(nextProposalId); i++) {
      ids.push(BigInt(i));
    }
    return ids.reverse();
  }, [nextProposalId]);

  const { data: proposalsData, refetch: refetchProposals } = useReadContracts({
    contracts: proposalIds.map(id => ({
      address: voterAddress,
      abi: voterAbi,
      functionName: "proposals",
      args: [id],
    })),
  });

  const { data: hasVotedData, refetch: refetchHasVoted } = useReadContracts({
    contracts: proposalIds.map(id => ({
      address: voterAddress,
      abi: voterAbi,
      functionName: "hasVoted",
      args: [id, userAddress as Address],
    })),
    query: { enabled: !!userAddress },
  });

  // --- THE OPTIMISTIC CLOCK ---
  useEffect(() => {
    if (!publicClient) return;

    // Sync with Reality
    const syncWithChain = async () => {
      try {
        const realBlock = await publicClient.getBlockNumber();
        setCurrentBlock(prev => {
          if (realBlock > prev || prev === 0n) return realBlock;
          return prev;
        });
      } catch (e) {
        console.error(e);
      }
    };

    // Tick Tock
    const tick = () => {
      setCurrentBlock(prev => {
        if (prev === 0n) return 0n;
        return prev + 1n;
      });
    };

    syncWithChain();
    const ticker = setInterval(tick, 2000);
    const syncer = setInterval(syncWithChain, 10000);

    return () => {
      clearInterval(ticker);
      clearInterval(syncer);
    };
  }, [publicClient]);

  // Force Refresh on block update
  useEffect(() => {
    if (currentBlock === 0n) return;
    refetchId();
    refetchProposals();
    if (isConnected) {
      refetchHasVoted();
      refetchVotingPower();
    }
  }, [currentBlock, refetchId, refetchProposals, refetchHasVoted, refetchVotingPower, isConnected]);

  // Event Listeners
  const refreshAll = useCallback(() => {
    refetchId();
    refetchProposals();
    if (isConnected) {
      refetchVotingPower();
      refetchHasVoted();
    }
    setVoteError(null);
  }, [refetchId, refetchProposals, refetchVotingPower, refetchHasVoted, isConnected]);

  useWatchContractEvent({ address: voterAddress, abi: voterAbi, eventName: "ProposalCreated", onLogs: refreshAll });
  useWatchContractEvent({ address: voterAddress, abi: voterAbi, eventName: "VoteCast", onLogs: refreshAll });
  useWatchContractEvent({ address: voterAddress, abi: voterAbi, eventName: "ProposalExecuted", onLogs: refreshAll });

  // Process Data
  const processedProposals = useMemo(() => {
    if (!proposalsData || currentBlock === 0n) return [];

    const list = proposalsData
      .map((result, index) => {
        if (result.status !== "success") return null;

        const prop = result.result as any;
        const id = proposalIds[index];
        const userHasVoted = hasVotedData?.[index]?.result || false;

        const description = prop[1];
        const endBlock = prop[3];
        const forVotes = prop[4];
        const againstVotes = prop[5];
        const target = prop[6];
        const value = prop[7];
        const payload = prop[8];
        const executed = prop[9];

        const blocksRemaining = endBlock - currentBlock;
        const isExpired = blocksRemaining <= 0n;

        let status: "Active" | "Passed" | "Failed" | "Executed" = "Active";

        if (executed) {
          status = "Executed";
        } else if (!isExpired) {
          status = "Active";
        } else {
          if (forVotes > againstVotes) status = "Passed";
          else status = "Failed";
        }

        let actionText = `Transfer of ${formatEther(value || BigInt(0))} ETH`;
        let finalTarget = target;
        if (payload && payload !== "0x") {
          const decoded = decodeTransfer(payload);
          if (decoded) {
            actionText = `Transfer of ${decoded.amount} USDC`;
            finalTarget = decoded.to;
          } else {
            actionText = "Contract Call";
          }
        }

        return {
          id,
          status,
          description,
          finalTarget,
          value,
          forVotes,
          againstVotes,
          executed,
          actionText,
          userHasVoted,
          blocksRemaining,
          endBlock,
        };
      })
      .filter(p => p !== null);

    return list.sort((a: any, b: any) => {
      if (a.status === "Active" && b.status !== "Active") return -1;
      if (a.status !== "Active" && b.status === "Active") return 1;
      return Number(b.id) - Number(a.id);
    });
  }, [proposalsData, hasVotedData, currentBlock, proposalIds]);

  // Handlers
  const handleSubmit = async () => {
    if (!voterAddress) return;
    try {
      let calldata = "0x";
      let ethValue = BigInt(0);
      let finalTarget = targetAddress;

      if (assetType === "ETH") {
        ethValue = parseEther(amount);
      } else {
        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        finalTarget = USDC_ADDRESS;
        const amountInWei = parseUnits(amount, 6);
        calldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [targetAddress as Address, amountInWei],
        });
      }

      writeContract({
        address: voterAddress,
        abi: voterAbi,
        functionName: "createProposal",
        args: [finalTarget as Address, ethValue, calldata, description],
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleVote = async (id: bigint, support: boolean, endBlock: bigint) => {
    setVoteError(null);
    try {
      const latestBlock = await publicClient?.getBlockNumber();
      if (latestBlock && latestBlock > endBlock) {
        setVoteError(`⚠️ Voting closed at block ${endBlock}. Current: ${latestBlock}. Refreshing...`);
        setCurrentBlock(latestBlock);
        return;
      }
      writeContract({ address: voterAddress, abi: voterAbi, functionName: "vote", args: [id, support] });
    } catch (e) {
      console.error("Voting check failed", e);
    }
  };

  const handleFinalize = (id: bigint) => {
    writeContract({
      address: voterAddress,
      abi: voterAbi,
      functionName: "finalizeAndSend",
      args: [id],
      value: parseEther("0.05"),
    });
  };

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300 h-full">
      <div className="card-body p-6">
        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="card-title text-3xl font-bold text-primary-content">🗳️ Governance</h2>
          <div className="flex flex-col items-end">
            <div className="text-xs uppercase tracking-widest opacity-60 font-semibold mb-1">Voting Power</div>
            <div className="badge badge-secondary badge-lg font-bold text-lg py-4">
              {/* Handle disconnected state for voting power */}
              {isConnected
                ? votingPower
                  ? parseFloat(formatEther(votingPower as bigint)).toFixed(2)
                  : "0"
                : "---"}{" "}
              WGT
            </div>
          </div>
        </div>

        {/* CONTENT AREA - Switches based on connection */}
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-60 gap-4 border-2 border-dashed border-base-300 rounded-xl bg-base-200/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
              />
            </svg>
            <div className="text-center">
              <h3 className="font-bold text-lg">Wallet Disconnected</h3>
              <p className="text-sm">Connect your wallet to view proposals and vote.</p>
            </div>
          </div>
        ) : (
          <>
            {!isOnBase && (
              <div className="alert alert-warning shadow-sm mb-6 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span>
                  Switch to <strong>Base Sepolia</strong> to interact.
                </span>
              </div>
            )}

            {voteError && (
              <div className="alert alert-error shadow-lg mb-6">
                <span>{voteError}</span>
              </div>
            )}

            {/* CREATE PROPOSAL FORM */}
            <div className="collapse collapse-plus bg-base-200/50 rounded-xl mb-8 border border-base-300">
              <input type="checkbox" />
              <div className="collapse-title text-xl font-bold text-primary-content flex justify-between items-center pr-12">
                <span>+ New Proposal</span>
              </div>
              <div className="collapse-content">
                <div className="grid gap-4 pt-4">
                  <div className="w-full bg-base-200/50 p-3 rounded text-sm text-center md:text-left opacity-70">
                    <span className="font-bold">Info:</span> Voting Period is{" "}
                    <span className="font-mono font-bold">
                      {votingPeriodBlocks ? votingPeriodBlocks.toString() : "..."} blocks
                    </span>{" "}
                    (~{votingPeriodBlocks ? Number(votingPeriodBlocks) * 2 : 0} seconds).
                  </div>

                  <div className="form-control w-full">
                    <label className="label pt-0">
                      <span className="label-text font-bold">Description</span>
                    </label>
                    <input
                      type="text"
                      placeholder="What should the DAO do?"
                      className="input input-bordered w-full bg-base-100"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="form-control w-full md:w-1/3">
                      <label className="label pt-0">
                        <span className="label-text font-bold">Asset</span>
                      </label>
                      <select
                        className="select select-bordered w-full bg-base-100"
                        value={assetType}
                        onChange={e => setAssetType(e.target.value as "ETH" | "USDC")}
                      >
                        <option value="ETH">Native ETH</option>
                        <option value="USDC">USDC Token</option>
                      </select>
                    </div>
                    <div className="form-control w-full md:w-2/3">
                      <label className="label pt-0">
                        <span className="label-text font-bold">Amount</span>
                      </label>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="input input-bordered w-full bg-base-100"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-control w-full">
                    <label className="label pt-0">
                      <span className="label-text font-bold">Recipient</span>
                    </label>
                    <input
                      type="text"
                      placeholder="0x..."
                      className="input input-bordered w-full font-mono text-sm bg-base-100"
                      value={targetAddress}
                      onChange={e => setTargetAddress(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      className="btn btn-primary px-8"
                      onClick={handleSubmit}
                      disabled={isPending || isConfirming || !isOnBase}
                    >
                      {isPending ? "Confirming..." : "Submit Proposal"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* PROPOSALS LIST */}
            <h3 className="font-bold text-xl mb-4 border-b border-base-300 pb-2 text-primary-content">Proposals</h3>
            <div className="space-y-4">
              {processedProposals.length === 0 ? (
                <div className="text-center py-10 opacity-50 bg-base-200 rounded-lg">No proposals found.</div>
              ) : (
                processedProposals.map((proposal: any) => (
                  <ProposalCard
                    key={proposal.id.toString()}
                    proposal={proposal}
                    onVote={handleVote}
                    onFinalize={handleFinalize}
                    isPending={isPending}
                    isOnBase={isOnBase}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ProposalCard = ({ proposal, onVote, onFinalize, isPending, isOnBase }: any) => {
  const {
    id,
    description,
    forVotes,
    againstVotes,
    status,
    finalTarget,
    actionText,
    userHasVoted,
    blocksRemaining,
    endBlock,
  } = proposal;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Active":
        return <span className="badge badge-primary badge-lg animate-pulse font-bold">Active</span>;
      case "Passed":
        return <span className="badge badge-success badge-lg font-bold text-white">Passed</span>;
      case "Failed":
        return <span className="badge badge-error badge-lg font-bold text-white">Failed</span>;
      case "Executed":
        return <span className="badge badge-ghost badge-lg font-bold">Executed</span>;
      default:
        return null;
    }
  };

  return (
    <div
      className={`card bg-base-100 border ${status === "Active" ? "border-primary border-2" : "border-base-300"} shadow-sm hover:shadow-md transition-all`}
    >
      <div className="card-body p-5">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="font-mono text-xs font-bold opacity-50 mb-1 block tracking-wide">
              PROPOSAL #{id.toString()}
            </span>
            <h4 className="text-lg font-bold leading-snug">{description}</h4>
          </div>
          {status === "Active" && (
            <div className="flex flex-col items-end">
              <span
                className={`text-xs font-bold ${blocksRemaining < 10n ? "text-error animate-pulse" : "opacity-50"}`}
              >
                {blocksRemaining <= 0n ? "Closing..." : `${blocksRemaining.toString()} Blocks Left`}
              </span>
            </div>
          )}
        </div>

        <div className="bg-base-200/50 rounded-lg p-3 my-3 text-xs font-mono border border-base-200/50 flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-lg opacity-60 font-semibold">Target:</span>
            <span className="text-lg opacity-90 truncate ml-4">{finalTarget}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-lg opacity-60 font-semibold">Action:</span>
            <span className="text-lg opacity-90 font-bold">{actionText}</span>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4 gap-4">
          {/* LEFT: Votes */}
          <div className="flex gap-4 text-sm font-bold shrink-0">
            <div className="flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-full border border-success/20">
              <span>👍 {parseFloat(formatEther(forVotes || BigInt(0))).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2 bg-error/10 text-error px-3 py-1.5 rounded-full border border-error/20">
              <span>👎 {parseFloat(formatEther(againstVotes || BigInt(0))).toFixed(2)}</span>
            </div>
          </div>

          {/* RIGHT: Status & Buttons */}
          <div className="flex items-center gap-2 justify-end shrink-0">
            {getStatusBadge(status)}

            {status === "Active" && !userHasVoted && (
              <>
                <button
                  className="btn btn-sm btn-success text-white px-4 whitespace-nowrap"
                  disabled={!isOnBase}
                  onClick={() => onVote(id, true, endBlock)}
                >
                  Vote For
                </button>
                <button
                  className="btn btn-sm btn-error text-white px-4 whitespace-nowrap"
                  disabled={!isOnBase}
                  onClick={() => onVote(id, false, endBlock)}
                >
                  Vote Against
                </button>
              </>
            )}

            {status === "Active" && userHasVoted && (
              <div className="badge badge-neutral badge-lg font-bold opacity-50 whitespace-nowrap">✅ You Voted</div>
            )}

            {status === "Passed" && (
              <button
                className="btn btn-sm btn-primary px-6 animate-bounce whitespace-nowrap"
                disabled={!isOnBase || isPending}
                onClick={() => onFinalize(id)}
              >
                {isPending ? "Bridging..." : "🚀 Execute"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
