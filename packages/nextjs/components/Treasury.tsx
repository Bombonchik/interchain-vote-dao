"use client";

import deployedContracts from "../contracts/deployedContracts";
import { Address } from "viem";
import { useBalance } from "wagmi";

// USDC Address on Sepolia
const USDC_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

export const Treasury = () => {
  const CHAIN_ID_SEPOLIA = 11155111;

  // FIX: Cast to 'any' to bypass strict typing on the artifacts file
  const contracts = deployedContracts as any;
  const sepoliaContracts = contracts[CHAIN_ID_SEPOLIA];
  const treasuryAddress = sepoliaContracts?.Treasury?.address;

  // 1. Fetch ETH Balance
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: treasuryAddress as Address,
    chainId: CHAIN_ID_SEPOLIA,
    query: {
      refetchInterval: 10000, // Poll every 10s to see updates live
    },
  });

  // 2. Fetch USDC Balance
  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address: treasuryAddress as Address,
    token: USDC_SEPOLIA,
    chainId: CHAIN_ID_SEPOLIA,
    query: {
      refetchInterval: 10000,
    },
  });

  return (
    <div className="card bg-neutral text-neutral-content shadow-xl">
      <div className="card-body">
        <h2 className="card-title text-2xl mb-4">🏦 Treasury (Sepolia)</h2>

        <div className="stats stats-vertical bg-base-100 text-base-content shadow lg:stats-horizontal w-full">
          {/* ETH Stat */}
          <div className="stat p-4">
            <div className="label-text">Native ETH</div>
            <div className="stat-value text-primary">
              {ethLoading ? "..." : parseFloat(ethBalance?.formatted || "0").toFixed(4)}
            </div>
            <div className="stat-desc">Sepolia Testnet</div>
          </div>

          {/* USDC Stat */}
          <div className="stat p-4">
            <div className="label-text">USDC Reserves</div>
            <div className="stat-value text-primary">
              {usdcLoading ? "..." : parseFloat(usdcBalance?.formatted || "0").toFixed(2)}
            </div>
            <div className="stat-desc">Circle Stablecoin</div>
          </div>
        </div>

        <div className="mt-6 text-sm opacity-75">
          <p className="font-bold mb-1">Contract Address:</p>
          <p className="font-mono text-xs break-all bg-neutral-focus p-2 rounded">
            {treasuryAddress || "Not Deployed"}
          </p>
        </div>
      </div>
    </div>
  );
};
