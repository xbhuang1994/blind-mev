import { formatUnits } from "@ethersproject/units";
import { ethers } from "ethers";
import { CONTRACTS, wssProvider, searcherWallet } from "./src/constants.js";
import {
  logDebug,
  logError,
  logFatal,
  logInfo,
  logSuccess,
  logTrace,
} from "./src/logging.js";
import { calcSandwichOptimalIn, calcSandwichState } from "./src/numeric.js";
import { parseUniv2RouterTx, parseUniversalRouterTx } from "./src/parse.js";
import {
  callBundleFlashbots,
  getRawTransaction,
  sanityCheckSimulationResponse,
  sendBundleFlashbots,
} from "./src/relayer.js";
import {
  getUniv2ExactWethTokenMinRecv,
  getUniv2PairAddress,
  getUniv2Reserve,
} from "./src/univ2.js";
import { calcNextBlockBaseFee, match, stringifyBN } from "./src/utils.js";

const blockMap = new Map();

// Note: You'll probably want to break this function up
//       handling everything in here so you can follow along easily
const sandwichUniswapV2RouterTx = async (txHash) => {
  let strLogPrefix = `txhash= ${txHash}`;
  const startTime = process.hrtime(); // 记录开始时间

  // Bot not broken right
  // logTrace(strLogPrefix, "received");
  // Get tx data
  const [tx, txRecp] = await Promise.all([
    wssProvider.getTransaction(txHash),
    wssProvider.getTransactionReceipt(txHash),
  ]);
  
  const endTime = process.hrtime(startTime); // 计算时间差
  
  // 将时间差转换为毫秒
  const executionTime = (endTime[0] * 1e9 + endTime[1]) / 1e6;
  
  // console.log(`代码块执行时间：${executionTime} 毫秒`);

  // Make sure transaction hasn't been mined
  if (txRecp !== null) {
    // return;
  }

  // Sometimes tx is null for some reason
  if (tx === null) {
    return;
  }
  let routerDataDecoded = null;
  // We're not a generalized version
  // So we're just gonna listen to specific addresses
  // and decode the data from there
  if (match(tx.to, CONTRACTS.UNIV2_ROUTER)) {
    // Decode transaction data
    // i.e. is this swapExactETHForToken?
    // You'll have to decode all the other possibilities :P
    routerDataDecoded = parseUniv2RouterTx(tx.data, tx.value);
    strLogPrefix += ' Univ2';
  }
  if (match(tx.to, CONTRACTS.UNIVERSAL_ROUTER)) {
    routerDataDecoded = parseUniversalRouterTx(tx.data);
    strLogPrefix += ' Universal';
  }

  // Basically means its not swapExactETHForToken and you need to add
  // other possibilities
  if (routerDataDecoded === null) {
    return;
  }

  const { path, amountIn, amountOutMin, deadline } = routerDataDecoded;

  // If tx deadline has passed, just ignore it
  // As we cannot sandwich it
  if (new Date().getTime() / 1000 > deadline) {
    // return;
  }

  // Get the min recv for token directly after WETH
  const userMinRecv = await getUniv2ExactWethTokenMinRecv(amountOutMin, path);
  const userAmountIn = amountIn; // User is sending exact ETH (not WETH)

  logTrace(
    strLogPrefix,
    "potentially sandwichable swapExactETHForTokens tx found",
    JSON.stringify(
      stringifyBN({
        userAmountIn,
        userMinRecv,
        path,
      })
    )
  );

  // Note: Since this is swapExactETHForTokens, the path will always be like so
  // Get the optimal in amount
  const [weth, token] = path;
  const pairToSandwich = getUniv2PairAddress(weth, token);
  const [reserveWeth, reserveToken] = await getUniv2Reserve(
    pairToSandwich,
    weth,
    token
  );
  const optimalWethIn = calcSandwichOptimalIn(
    userAmountIn,
    userMinRecv,
    reserveWeth,
    reserveToken
  );

  // Lmeow, nothing to sandwich!
  if (optimalWethIn.lte(ethers.constants.Zero)) {
    return;
  }

  // Contains 3 states:
  // 1: Frontrun state
  // 2: Victim state
  // 3: Backrun state
  const sandwichStates = calcSandwichState(
    optimalWethIn,
    userAmountIn,
    userMinRecv,
    reserveWeth,
    reserveToken
  );

  // Sanity check failed
  if (sandwichStates === null) {
    logDebug(
      strLogPrefix,
      "sandwich sanity check failed",
      ethers.utils.formatUnits(optimalWethIn, "ether"),
      ethers.utils.formatUnits(userAmountIn, "ether"),
      JSON.stringify(
        stringifyBN({
          optimalWethIn,
          reserveToken,
          reserveWeth,
          userAmountIn,
          userMinRecv,
        })
      )
    );
    return;
  }

  if (sandwichStates.revenue.lt(0)) {
    logDebug(strLogPrefix, "not profit");
    return;
  }
  // Cool profitable sandwich :)
  // But will it be post gas?
  logInfo(
    strLogPrefix,
    "sandwichable target found",
    JSON.stringify(stringifyBN(sandwichStates))
  );

  logInfo(
    strLogPrefix,
    "sandwichable profit",
    ethers.utils.formatEther(sandwichStates.revenue),
    ethers.utils.formatEther(optimalWethIn),
    ethers.utils.formatEther(sandwichStates.backrun.amountOut)
  );
  // Get block data to compute bribes etc
  // as bribes calculation has correlation with gasUsed
  const block = await wssProvider.getBlock();
  const targetBlockNumber = block.number + 1;
  logInfo(strLogPrefix, 'targetBlockNumber', targetBlockNumber);

  const nextBaseFee = calcNextBlockBaseFee(block);
  const nonce = await wssProvider.getTransactionCount(searcherWallet.address);
  logInfo(strLogPrefix, 'noce ', nonce);
  const frontsliceSwap = {
    token: weth,
    pair: pairToSandwich,
    amountIn: optimalWethIn,
    amountOut: sandwichStates.frontrun.amountOut,
    tokenOutNo: ethers.BigNumber.from(token).lt(ethers.BigNumber.from(weth)) ? 0 : 1,
  }
  // Craft our payload
  const frontslicePayload = buildPayload([frontsliceSwap], 0);

  // ethers.utils.solidityPack(
  //   ["address", "address", "uint128", "uint128", "uint8"],
  //   [
  //     token,
  //     pairToSandwich,
  //     optimalWethIn,
  //     sandwichStates.frontrun.amountOut,
  //     ethers.BigNumber.from(token).lt(ethers.BigNumber.from(weth)) ? 0 : 1,
  //   ]
  // );
  const frontsliceTx = {
    to: CONTRACTS.SANDWICH,
    from: searcherWallet.address,
    data: frontslicePayload,
    chainId: 1,
    maxPriorityFeePerGas: 0,
    maxFeePerGas: nextBaseFee,
    gasLimit: 250000,
    nonce,
    type: 2,
  };
  logInfo(strLogPrefix, 'start sig', frontsliceTx.from);
  const frontsliceTxSigned = await searcherWallet.signTransaction(frontsliceTx);

  const middleTx = getRawTransaction(tx);
  const backsliceSwap = {
    token: token,
    pair: pairToSandwich,
    amountIn: sandwichStates.frontrun.amountOut.sub(1),//Save a bit to save gas fee for the next attack
    amountOut: sandwichStates.backrun.amountOut,
    tokenOutNo: ethers.BigNumber.from(token).lt(ethers.BigNumber.from(weth)) ? 0 : 1,
  }
  const backslicePayload = buildPayload([backsliceSwap], 1);
  // ethers.utils.solidityPack(
  //   ["address", "address", "uint128", "uint128", "uint8"],
  //   [
  //     weth,
  //     pairToSandwich,
  //     sandwichStates.frontrun.amountOut,
  //     sandwichStates.backrun.amountOut,
  //     ethers.BigNumber.from(weth).lt(ethers.BigNumber.from(token)) ? 0 : 1,
  //   ]
  // );
  const backsliceTx = {
    to: CONTRACTS.SANDWICH,
    from: searcherWallet.address,
    data: backslicePayload,
    chainId: 1,
    maxPriorityFeePerGas: 0,
    maxFeePerGas: nextBaseFee,
    gasLimit: 250000,
    nonce: nonce + 1,
    type: 2,
  };
  const backsliceTxSigned = await searcherWallet.signTransaction(backsliceTx);

  // Simulate tx to get the gas used
  const signedTxs = [frontsliceTxSigned, middleTx, backsliceTxSigned];
  // const signedTxs = [frontsliceTxSigned];
  logInfo(strLogPrefix, '================= try simulate ===================',targetBlockNumber);
  const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);
  // Try and check all the errors
  try {
    sanityCheckSimulationResponse(simulatedResp);
  } catch (e) {
    logError(
      strLogPrefix,
      "error while simulating",
      // JSON.stringify(
      //   stringifyBN({
      //     error: e,
      //     // block,
      //     targetBlockNumber,
      //     nextBaseFee,
      //     nonce,
      //     sandwichStates,
      //     frontsliceTx,
      //     backsliceTx,
      //   })
      // )
    );

    return;
  }
  // Extract gas
  const frontsliceGas = ethers.BigNumber.from(simulatedResp.results[0].gasUsed);
  // logInfo(strLogPrefix, "gas =====================", stringifyBN([frontsliceGas]));
  // return;
  const backsliceGas = ethers.BigNumber.from(simulatedResp.results[2].gasUsed);
  logInfo(strLogPrefix, "gas ", stringifyBN([frontsliceGas, backsliceGas, frontsliceGas.add(backsliceGas)]));
  // return;

  // Bribe 99.99% :P
  const bribeAmount = sandwichStates.revenue.sub(
    frontsliceGas.mul(nextBaseFee)
  );

  const toCoinebase = bribeAmount.mul(9999).div(10000);
  logInfo(
    strLogPrefix,
    "=======================  bribe =========================",
    ethers.utils.formatEther(bribeAmount),
    ethers.utils.formatEther(toCoinebase)
  );
  if(bribeAmount.lt(0)){
    logInfo(strLogPrefix, "not profit");
    return;
  }
  // return;

  // console.log(frontsliceGas);
  // console.log(backsliceGas);
  // return;
  // const maxPriorityFeePerGas = bribeAmount
  //   .mul(9999)
  //   .div(10000)
  //   .div(backsliceGas);

  // Note: you probably want some circuit breakers here so you don't lose money
  // if you fudged shit up

  // If 99.99% bribe isn't enough to cover base fee, its not worth it
  // if (maxPriorityFeePerGas.lt(nextBaseFee)) {
  //   logTrace(
  //     strLogPrefix,
  //     `maxPriorityFee (${formatUnits(
  //       maxPriorityFeePerGas,
  //       9
  //     )}) gwei < nextBaseFee (${formatUnits(nextBaseFee, 9)}) gwei`
  //   );
  //   return;
  // }
  const backslicePayload2 = buildPayload([backsliceSwap], toCoinebase);
  const backsliceTx2 = {
    ...backsliceTx,
    data: backslicePayload2,
  }
  // Okay, update backslice tx
  const backsliceTxSignedWithBribe = await searcherWallet.signTransaction(backsliceTx2);
  
  logInfo(strLogPrefix, '================= try simulate again ===================',targetBlockNumber);
  const simulatedResp2 = await callBundleFlashbots([frontsliceTxSigned, middleTx, backsliceTxSignedWithBribe], targetBlockNumber);
  // Try and check all the errors
  try {
    sanityCheckSimulationResponse(simulatedResp2);
  } catch (e) {
    logError(
      strLogPrefix,
      "error while simulating again",
      JSON.stringify(
        stringifyBN({
          error: e,
          // block,
          // targetBlockNumber,
          // nextBaseFee,
          // nonce,
          // sandwichStates,
          // frontsliceTx,
          backsliceTx2,
        })
      )
    );

    return;
  }
  logSuccess(strLogPrefix,"!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  // throw new Error("????");
  return;
  // Fire the bundles
  const bundleResp = await sendBundleFlashbots(
    [frontsliceTxSigned, middleTx, backsliceTxSignedWithBribe],
    targetBlockNumber
  );
  logSuccess(
    strLogPrefix,
    "Bundle submitted!",
    JSON.stringify(
      block,
      targetBlockNumber,
      nextBaseFee,
      nonce,
      sandwichStates,
      frontsliceTx,
      bundleResp
    )
  );
};

const main = async () => {
  logInfo(
    "============================================================================"
  );
  logInfo(
    "          _                       _         _   \r\n  ____  _| |____ __ ____ _ _  _  | |__  ___| |_ \r\n (_-< || | '_ \\ V  V / _` | || | | '_ \\/ _ \\  _|\r\n /__/\\_,_|_.__/\\_/\\_/\\__,_|\\_, | |_.__/\\___/\\__|\r\n | |__ _  _  | (_) |__  ___|__/__ __            \r\n | '_ \\ || | | | | '_ \\/ -_) V / '  \\           \r\n |_.__/\\_, | |_|_|_.__/\\___|\\_/|_|_|_|          \r\n       |__/                                     \n"
  );
  logInfo("github: https://github.com/libevm");
  logInfo("twitter: https://twitter.com/libevm");
  logInfo(
    "============================================================================\n"
  );
  logInfo(`Searcher Wallet: ${searcherWallet.address}`);
  logInfo(`Node URL: ${wssProvider.connection.url}\n`);
  logInfo(
    "============================================================================\n"
  );

  // Add timestamp to all subsequent console.logs
  // One little two little three little dependency injections....
  const origLog = console.log;
  console.log = function (obj, ...placeholders) {
    if (typeof obj === "string")
      placeholders.unshift("[" + new Date().toISOString() + "] " + obj);
    else {
      // This handles console.log( object )
      placeholders.unshift(obj);
      placeholders.unshift("[" + new Date().toISOString() + "] %j");
    }

    origLog.apply(this, placeholders);
  };

  logInfo("Listening to mempool...\n");
  // sandwichUniswapV2RouterTx('0x83caa6827f6ffd0cb6872cbca8526444c00992601a2086c3a449228c3d35386d').catch(e => {
  //   logFatal(`error ${JSON.stringify(e)}`);
  // });
  // Listen to the mempool on local node
  wssProvider.on("pending", (txHash) => {
    sandwichUniswapV2RouterTx(txHash);  
    // sandwichUniswapV2RouterTx(txHash).catch((e) => {
    //   logFatal(`txhash=${txHash} error ${JSON.stringify(e)}`);
    // })
  }

  );
};
function buildPayload(swaps, toCoinebase = 0) {
  let payload = ethers.utils.solidityPack(['uint8', 'uint128'], [swaps.length, toCoinebase]);

  for (let i = 0; i < swaps.length; i++) {
    const swap = swaps[i];
    const swapData = ethers.utils.solidityPack(
      ['address', 'address', 'uint128', 'uint128', 'uint8'],
      [swap.token, swap.pair, swap.amountIn, swap.amountOut, swap.tokenOutNo]
    );
    payload = ethers.utils.concat([payload, swapData]);
  }

  return payload;
}

main();
