// Globals
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { logError } from "./logging.js";

const IUniswapV2PairAbi = require("./abi/IUniswapV2Pair.json");
const IMultiSwapOptimized = require('./abi/IMultiSwapOptimized.json');
export const IWETHAbi = require('./abi/IWETH.json');
let hasEnv = true;

const ENV_VARS = [
  "RPC_URL",
  "RPC_URL_WSS",
  "PRIVATE_KEY",
  "FLASHBOTS_AUTH_KEY",
  "SANDWICH_CONTRACT",
];

for (let i = 0; i < ENV_VARS.length; i++) {
  if (!process.env[ENV_VARS[i]]) {
    logError(`Missing env var ${ENV_VARS[i]}`);
    hasEnv = false;
  }
}

if (!hasEnv) {
  process.exit(1);
}

// Contracts
export const CONTRACTS = {
  UNIV2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  UNIVERSAL_ROUTER: "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B",

  // Sandwich contract
  SANDWICH: process.env.SANDWICH_CONTRACT,
};

// Helpful tokens for testing
export const TOKENS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

// Providers
export const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL
);
export const wssProvider = new ethers.providers.WebSocketProvider(
  process.env.RPC_URL_WSS
);

// Used to send transactions, needs ether
export const searcherWallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  wssProvider
);

// Used to sign flashbots headers doesn't need any ether
export const authKeyWallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  wssProvider
);

// Common contracts
export const uniswapV2Pair = new ethers.Contract(
  ethers.constants.AddressZero,
  IUniswapV2PairAbi,
  searcherWallet
);

export const wethContract = new ethers.Contract(
  TOKENS.WETH,
  IWETHAbi,
  searcherWallet
);

export const multiSwapOptimized = new ethers.Contract(
    process.env.SANDWICH_CONTRACT,
    IMultiSwapOptimized,
    searcherWallet
  );

export const UniversalCommands = {
  // Masks to extract certain bits of commands
  FLAG_ALLOW_REVERT: 0x80,
  COMMAND_TYPE_MASK: 0x1f,
  NFT_TYPE_MASK: 0x10,
  SUB_IF_BRANCH_MASK: 0x08,

  // Command Types. Maximum supported command at this moment is 0x1F.

  // Command Types where value<0x08, executed in the first nested-if block
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_TRANSFER_FROM: 0x02,
  PERMIT2_PERMIT_BATCH: 0x03,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  COMMAND_PLACEHOLDER_0x07: 0x07,

  // Command Types where 0x08<=value<=0x0f, executed in the second nested-if block
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0d,
  COMMAND_PLACEHOLDER_0x0e: 0x0e,
  COMMAND_PLACEHOLDER_0x0f: 0x0f,

  // Command Types where 0x10<=value<0x18, executed in the third nested-if block
  SEAPORT: 0x10,
  LOOKS_RARE_721: 0x11,
  NFTX: 0x12,
  CRYPTOPUNKS: 0x13,
  LOOKS_RARE_1155: 0x14,
  OWNER_CHECK_721: 0x15,
  OWNER_CHECK_1155: 0x16,
  SWEEP_ERC721: 0x17,

  // Command Types where 0x18<=value<=0x1f, executed in the final nested-if block
  X2Y2_721: 0x18,
  SUDOSWAP: 0x19,
  NFT20: 0x1a,
  X2Y2_1155: 0x1b,
  FOUNDATION: 0x1c,
  SWEEP_ERC1155: 0x1d,
  COMMAND_PLACEHOLDER_0x1e: 0x1e,
  COMMAND_PLACEHOLDER_0x1f: 0x1f,
}
