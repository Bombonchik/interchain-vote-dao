"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import deployedContracts from "../contracts/deployedContracts";
import { useOutsideClick, useTargetNetwork } from "../hooks/scaffold-eth";
import { FaucetButton, RainbowKitCustomConnectButton } from "./scaffold-eth";
import { hardhat } from "viem/chains";
import { useAccount, useReadContract } from "wagmi";
import { Bars3Icon, BugAntIcon } from "@heroicons/react/24/outline";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const { address: userAddress, isConnected } = useAccount();
  const CHAIN_ID_BASE_SEPOLIA = 84532;

  // Safely access contracts
  const contracts = deployedContracts as any;
  const baseContracts = contracts ? contracts[CHAIN_ID_BASE_SEPOLIA] : null;
  const voterAddress = baseContracts?.Voter?.address;
  const voterAbi = baseContracts?.Voter?.abi;

  const { data: voterOwner } = useReadContract({
    address: voterAddress,
    abi: voterAbi,
    functionName: "owner",
    chainId: CHAIN_ID_BASE_SEPOLIA,
    query: {
      enabled: isConnected && !!userAddress && !!voterAddress,
      retry: false,
    },
  });

  const isOwner = !!(userAddress && voterOwner && userAddress.toLowerCase() === (voterOwner as string).toLowerCase());

  const menuLinks: HeaderMenuLink[] = [
    {
      label: "Home",
      href: "/",
    },
  ];

  if (isOwner) {
    menuLinks.push({
      label: "Config Contracts",
      href: "/debug",
      icon: <BugAntIcon className="h-4 w-4" />,
    });
  }

  return (
    <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-0 sm:px-2">
      <div className="navbar-start w-auto lg:w-1/2">
        <div className="lg:hidden dropdown" ref={burgerMenuRef}>
          <label
            tabIndex={0}
            className={`ml-1 btn btn-ghost ${isDrawerOpen ? "hover:bg-secondary" : "hover:bg-transparent"}`}
            onClick={() => {
              setIsDrawerOpen(prev => !prev);
            }}
          >
            <Bars3Icon className="h-1/2" />
          </label>
          {isDrawerOpen && (
            <ul
              tabIndex={0}
              className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-base-100 rounded-box w-52"
              onClick={() => {
                setIsDrawerOpen(false);
              }}
            >
              <HeaderMenuLinks menuLinks={menuLinks} />
            </ul>
          )}
        </div>
        <Link href="/" className="hidden lg:flex items-center gap-2 ml-4 mr-6 shrink-0">
          <div className="flex flex-col">
            <span className="font-bold leading-tight">Interchain Vote DAO</span>
            <span className="text-xs">Governance Portal</span>
          </div>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
          <HeaderMenuLinks menuLinks={menuLinks} />
        </ul>
      </div>
      <div className="navbar-end flex-grow mr-4">
        <div className="flex items-center gap-4">
          {isOwner && <span className="text-xs font-bold opacity-50 hidden sm:block">👑 Admin</span>}
          <RainbowKitCustomConnectButton />
          {/* Only show Faucet on Localhost */}
          {isLocalNetwork && <FaucetButton />}
        </div>
      </div>
    </div>
  );
};

const HeaderMenuLinks = ({ menuLinks }: { menuLinks: HeaderMenuLink[] }) => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "bg-secondary shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};
