"use client";

import { useMemo, useState } from "react";
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
  useBlockNumber,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

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

// Helper to decode calldata for display
const decodeTransfer = (calldata: `0x${string}`) => {
  try {
    // Check if it's a transfer call (selector 0xa9059cbb)
    if (!calldata || calldata === "0x" || calldata.length < 10) return null;

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: calldata,
    });

    if (decoded.functionName === "transfer") {
      const [to, amount] = decoded.args;
      // Assume 6 decimals for USDC display purposes
      return { to, amount: formatUnits(amount, 6) };
    }
  } catch (e) {
    console.error("Failed to decode calldata", e);
  }
  return null;
};

export const Governance = () => {
  const { address: userAddress, chainId, isConnected } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const CHAIN_ID_BASE_SEPOLIA = 84532;
  const isOnBase = chainId === CHAIN_ID_BASE_SEPOLIA;

  const contracts = deployedContracts as any;
  const baseContracts = contracts[CHAIN_ID_BASE_SEPOLIA];

  const voterAddress = baseContracts?.Voter?.address;
  const daoTokenAddress = baseContracts?.DAOToken?.address;
  const voterAbi = baseContracts?.Voter?.abi;
  const tokenAbi = baseContracts?.DAOToken?.abi;

  const [description, setDescription] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [assetType, setAssetType] = useState<"ETH" | "USDC">("ETH");

  const { data: votingPower } = useReadContract({
    address: daoTokenAddress,
    abi: tokenAbi,
    functionName: "getVotes",
    args: [userAddress as Address],
    query: { enabled: !!userAddress && !!daoTokenAddress },
  });

  const { data: nextProposalId } = useReadContract({
    address: voterAddress,
    abi: voterAbi,
    functionName: "nextProposalId",
    query: { enabled: !!voterAddress },
  });

  const proposalIds = useMemo(() => {
    if (!nextProposalId) return [];
    const ids = [];
    for (let i = 1; i < Number(nextProposalId); i++) {
      ids.push(BigInt(i));
    }
    return ids.reverse();
  }, [nextProposalId]);

  const { data: proposalsData } = useReadContracts({
    contracts: proposalIds.map(id => ({
      address: voterAddress,
      abi: voterAbi,
      functionName: "proposals",
      args: [id],
    })),
    query: { enabled: proposalIds.length > 0 },
  });

  // --- Logic: Sort and Process ---
  const processedProposals = useMemo(() => {
    if (!proposalsData || !blockNumber) return [];

    const list = proposalsData
      .map((result, index) => {
        if (result.status !== "success") return null;

        const prop = result.result as any;
        const id = proposalIds[index];

        const description = prop[1];
        const endBlock = prop[3];
        const forVotes = prop[4];
        const againstVotes = prop[5];
        const target = prop[6];
        const value = prop[7];
        const payload = prop[8];
        const executed = prop[9];

        let status: "Active" | "Passed" | "Failed" | "Executed" = "Active";
        const isExpired = blockNumber > endBlock;

        if (executed) {
          status = "Executed";
        } else if (!isExpired) {
          status = "Active";
        } else {
          if (forVotes > againstVotes) status = "Passed";
          else status = "Failed";
        }

        // Decode Payload for better UI
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
        };
      })
      .filter(p => p !== null);

    return list.sort((a: any, b: any) => {
      if (a.status === "Active" && b.status !== "Active") return -1;
      if (a.status !== "Active" && b.status === "Active") return 1;
      return Number(b.id) - Number(a.id);
    });
  }, [proposalsData, blockNumber, proposalIds]);

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

  const handleVote = (id: bigint, support: boolean) => {
    writeContract({ address: voterAddress, abi: voterAbi, functionName: "vote", args: [id, support] });
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

  if (!isConnected) {
    return (
      <div className="card bg-base-100 shadow-xl p-8 text-center border border-base-300">
        <h2 className="text-2xl font-bold mb-2">Welcome</h2>
        <p className="opacity-70">Please connect your wallet to interact.</p>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl border border-base-300">
      <div className="card-body p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="card-title text-3xl font-bold text-primary-content">🗳️ Governance</h2>
          <div className="flex flex-col items-end">
            <div className="text-xs uppercase tracking-widest opacity-60 font-semibold mb-1">Voting Power</div>
            <div className="badge badge-secondary badge-lg font-bold text-lg py-4">
              {votingPower ? parseFloat(formatEther(votingPower as bigint)).toFixed(2) : "0"} WGT
            </div>
          </div>
        </div>

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

        {/* Create Proposal Form */}
        <div className="collapse collapse-plus bg-base-200/50 rounded-xl mb-8 border border-base-300">
          <input type="checkbox" />
          <div className="collapse-title text-xl font-bold text-primary-content">+ New Proposal</div>
          <div className="collapse-content">
            <div className="grid gap-4 pt-4">
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

        {/* Proposal List */}
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
      </div>
    </div>
  );
};

const ProposalCard = ({ proposal, onVote, onFinalize, isPending, isOnBase }: any) => {
  const { id, description, forVotes, againstVotes, status, finalTarget, actionText } = proposal;

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
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="font-mono text-xs font-bold opacity-50 mb-1 block tracking-wide">
              PROPOSAL #{id.toString()}
            </span>
            <h4 className="text-lg font-bold leading-snug">{description}</h4>
          </div>
          {/* Removed Status Badge from Top Right - Will put in footer */}
        </div>

        {/* Details */}
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

        {/* Footer: Votes Left / Status & Actions Right */}
        <div className="flex flex-col sm:flex-row justify-between items-center mt-2 gap-4">
          {/* Vote Stats */}
          <div className="flex gap-4 text-sm font-bold w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-full border border-success/20">
              <span>👍 {parseFloat(formatEther(forVotes || BigInt(0))).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2 bg-error/10 text-error px-3 py-1.5 rounded-full border border-error/20">
              <span>👎 {parseFloat(formatEther(againstVotes || BigInt(0))).toFixed(2)}</span>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Status Badge Here now */}
            {getStatusBadge(status)}

            {status === "Active" && (
              <>
                <button
                  className="btn btn-sm btn-success text-white px-4"
                  disabled={!isOnBase}
                  onClick={() => onVote(id, true)}
                >
                  Vote For
                </button>
                <button
                  className="btn btn-sm btn-error text-white px-4"
                  disabled={!isOnBase}
                  onClick={() => onVote(id, false)}
                >
                  Vote Against
                </button>
              </>
            )}
            {status === "Passed" && (
              <button
                className="btn btn-sm btn-primary px-6 animate-bounce"
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
