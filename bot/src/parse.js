import { createRequire } from "module";
const require = createRequire(import.meta.url);

import abiDecoder from "abi-decoder";
import { ethers } from "ethers";
import { TOKENS, UniversalCommands } from "./constants.js";
const IUniswapV2RouterABI = require("./abi/IUniswapV2Router02.json");
const IUniswapUniversalABI = require("./abi/IUniswapUniversal.json");

// Easily decode UniswapV2 Router data
abiDecoder.addABI(IUniswapV2RouterABI);
abiDecoder.addABI(IUniswapUniversalABI);

// Only does swapExactETHForTokens
// You'll need to extend it yourself :P
export const parseUniv2RouterTx = (txData, value) => {
  let data = null;
  try {
    data = abiDecoder.decodeMethod(txData);
  } catch (e) {
    return null;
  }
  let amountOutMin, path, to, deadline, amountIn;
  switch (data.name) {
    case "swapExactTokensForETH":
    case "swapExactTokensForTokens":
    case "swapExactTokensForTokensSupportingFeeOnTransferTokens":
    case "swapExactTokensForETHSupportingFeeOnTransferTokens":
      [amountIn, amountOutMin, path, to, deadline] = data.params.map((x) => x.value);
      if (path[0] != TOKENS.WETH) //not weth
      {
        return null;
      }
      break;
    case "swapExactETHForTokensSupportingFeeOnTransferTokens":
    case "swapExactETHForTokens":
      [amountOutMin, path, to, deadline] = data.params.map((x) => x.value);
      amountIn = value;
      break;
    case "swapETHForExactTokens":
      [amountOutMin, path, to, deadline] = data.params.map((x) => x.value);
      amountIn = value;
      break;
    default:
      console.log(data.name);
      console.log(data.params);
      return null;
  }
  return {
    amountIn,
    amountOutMin,
    path,
    to,
    deadline,
  };
};

export const parseUniversalRouterTx = (txData) => {
  let data = null;
  try {
    data = abiDecoder.decodeMethod(txData);
  } catch (e) {
    return null;
  }
  // let commandArr = parseCommands(data);
  if (data.name == "execute") {
    const abiCoder = new ethers.utils.AbiCoder();
    const [commands, inputs, deadline] = data.params.map((x) => x.value);
    let commandArr = parseCommands(commands);
    for (let index = 0; index < commandArr.length; index++) {
      const command = commandArr[index];
      const inputData = inputs[index];
      switch (command) {
        case UniversalCommands.V2_SWAP_EXACT_IN:
          {
            const [address, amountIn, amountOutMin, path, bl] = abiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputData);
            if (path[0] == TOKENS.WETH)
              return { amountIn, amountOutMin, path, deadline };
          }
        case UniversalCommands.V2_SWAP_EXACT_OUT:
          {
            const [address, amountOutMin, amountIn, path, bl] = abiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputData);
            if (path[0] == TOKENS.WETH)
              return { amountIn, amountOutMin, path, deadline };
          }
        default:
          break;
      }
    }
  }
  return null;

  function parseCommands(commands) {
    // 使用正则表达式替换指定字符为空字符串
    commands = commands.replace(new RegExp("0x", "g"), "");
    // 使用正则表达式匹配每两个字符，并将其转换为十进制数
    let hexArray = commands.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
    return hexArray
  }

};