"use client";

import { Governance } from "../components/Governance";
import { Treasury } from "../components/Treasury";

export default function Home() {
  return (
    <div className="flex flex-col items-center min-h-screen bg-base-200 py-10">
      <div className="max-w-7xl w-full px-4">
        <h1 className="text-4xl font-bold text-center mb-8 text-secondary-content">Interchain Vote DAO</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel: Governance (Base Sepolia) - Takes up 2/3 width on desktop */}
          <div className="lg:col-span-2">
            <Governance />
          </div>

          {/* Right Panel: Treasury (Sepolia) - Takes up 1/3 width on desktop */}
          <div className="lg:col-span-1">
            <Treasury />
          </div>
        </div>
      </div>
    </div>
  );
}
