import { createRequire } from "module";
const require = createRequire(import.meta.url);

import abiDecoder from "abi-decoder";
import { TOKENS } from "./constants.js";
const IUniswapV2RouterABI = require("./abi/IUniswapV2Router02.json");

// Easily decode UniswapV2 Router data
abiDecoder.addABI(IUniswapV2RouterABI);

// Only does swapExactETHForTokens
// You'll need to extend it yourself :P
export const parseUniv2RouterTx = (txData,value) => {
  let data = null;
  try {
    data = abiDecoder.decodeMethod(txData);
  } catch (e) {
    return null;
  }
  let amountOutMin, path, to, deadline,amountIn;
  switch (data.name) {
    case "swapExactTokensForETH":
    case "swapExactTokensForTokens":
    case "swapExactTokensForTokensSupportingFeeOnTransferTokens":
    case "swapExactTokensForETHSupportingFeeOnTransferTokens":
      [amountIn,amountOutMin,path,to,deadline] = data.params.map((x) => x.value);
      if(path[0] != TOKENS.WETH) //not weth
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
