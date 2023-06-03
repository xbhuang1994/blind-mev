import { ethers } from 'ethers';
import { searcherWallet, CONTRACTS, wssProvider } from './constants.js';
import { logError, logInfo, logSuccess } from './logging.js';
import { callBundleFlashbots, getRawTransaction, sanityCheckSimulationResponse, sendBundleFlashbots } from './relayer.js';
import { calcNextBlockBaseFee, stringifyBN } from './utils.js';

class SandwichBundle {
    constructor(frontsliceSwap, middleRawTx, backsliceSwap, revenue) {
        this.frontsliceSwap = frontsliceSwap;
        this.middleRawTx = middleRawTx;
        this.backsliceSwap = backsliceSwap;
        this.revenue = revenue;
    }
}
export class BundleManager {
    constructor() {
        this.targetBlockNumber = 0;
        this._sandwichBundles = new Map();
    }

    async appendSandwich(frontsliceSwap, middleTx, backsliceSwap, revenue) {
        const block = await wssProvider.getBlock();
        const targetBlockNumber = block.number + 1;
        this._setTargetBlockNumber(targetBlockNumber);
        const nextBaseFee = calcNextBlockBaseFee(block);
        const nonce = await wssProvider.getTransactionCount(searcherWallet.address);
        const middleRawTx = getRawTransaction(middleTx);
        const frontsliceTxSigned = await this._buildSignTxBySwaps([frontsliceSwap], nextBaseFee, nonce, 0);
        const backsliceTxSigned = await this._buildSignTxBySwaps([backsliceSwap], nextBaseFee, nonce + 1, 0);
        const signedTxs = [frontsliceTxSigned, middleRawTx, backsliceTxSigned];

        const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);

        try {
            sanityCheckSimulationResponse(simulatedResp);
        } catch (e) {
            logError(
                middleTx.hash,
                "error while simulating",
                JSON.stringify(
                    stringifyBN({
                        error: e,
                        // block,
                        targetBlockNumber,
                        nextBaseFee,
                        // nonce,
                        // sandwichStates,
                        // frontsliceTx,
                        // backsliceTx,
                    })
                )
            );
            return;
        }
        // Extract gas
        const frontsliceGas = ethers.BigNumber.from(simulatedResp.results[0].gasUsed);
        const backsliceGas = ethers.BigNumber.from(simulatedResp.results[2].gasUsed);
        logInfo("gas ", stringifyBN([frontsliceGas, backsliceGas, frontsliceGas.add(backsliceGas)]));
        const totalGas = frontsliceGas.add(backsliceGas);
        const bribeAmount = revenue.sub(
            totalGas.mul(nextBaseFee)
        );
        logInfo("bribeAmount", ethers.utils.formatEther(bribeAmount));
        // logInfo('half of totalGas', ethers.utils.formatEther(totalGas.mul(nextBaseFee).div(-2)));
        if (bribeAmount.lt(0)) {
            return;
        }
        let key = frontsliceSwap.pair;
        let sandwichBundle = new SandwichBundle(frontsliceSwap, middleRawTx, backsliceSwap, revenue);
        if (this._sandwichBundles.has(key)) {
            let bundle = this._sandwichBundles.get(key);
            if (bundle.revenue < revenue) {
                this._updateSandwichBundle(key, sandwichBundle);
                logInfo('update sandwich bundle', key);
            }
        } else {
            this._updateSandwichBundle(key, sandwichBundle);
            logInfo('set sandwich bundle', key);
        }

        logInfo('_sandwichBundles size', this._sandwichBundles.size);
    }
    async _submitBundles() {
        const block = await wssProvider.getBlock();
        const targetBlockNumber = block.number + 1;
        this._setTargetBlockNumber(targetBlockNumber);
        if (this._sandwichBundles.size == 0) {
            return;
        }
        const nextBaseFee = calcNextBlockBaseFee(block);
        const nonce = await wssProvider.getTransactionCount(searcherWallet.address);
        const values = this._sandwichBundles.values();
        const frontsliceSwaps = [];
        const middleRawTxs = [];
        const backsliceSwaps = [];
        let revenue = ethers.BigNumber.from(0);
        for (let value of values) {
            frontsliceSwaps.push(value.frontsliceSwap);
            middleRawTxs.push(value.middleRawTx);
            backsliceSwaps.push(value.backsliceSwap);
            revenue = revenue.add(value.revenue);
        }
        const frontsliceTxSigned = await this._buildSignTxBySwaps(frontsliceSwaps, nextBaseFee, nonce, 0);
        const backsliceTxSigned = await this._buildSignTxBySwaps(backsliceSwaps, nextBaseFee, nonce + 1, 1);
        const signedTxs = [frontsliceTxSigned, ...middleRawTxs, backsliceTxSigned];
        const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);
        try {
            sanityCheckSimulationResponse(simulatedResp);
        } catch (e) {
            logError(
                "error while simulating",
                JSON.stringify(
                    stringifyBN({
                        error: e,
                        targetBlockNumber,
                        nextBaseFee,
                        signedTxs
                    })
                )
            );
            return;
        }

        // Extract gas
        const results = simulatedResp.results;
        const desiredFromAddress = searcherWallet.address;
        const gasUsedValues = results
            .filter(result => result.fromAddress === desiredFromAddress)
            .map(result => ethers.BigNumber.from(result.gasUsed));
        const gasUsedSum = gasUsedValues.reduce((accumulator, currentValue) => accumulator.add(currentValue));
        logInfo("gas ", gasUsedValues, gasUsedSum);
        let bribeAmount = revenue.sub(
            gasUsedSum.mul(nextBaseFee)
        );
        bribeAmount = bribeAmount.add(ethers.utils.parseEther('0.002'));// test
        logInfo('bribe amount', ethers.utils.formatUnits(bribeAmount, 'ether'));
        if (bribeAmount.lt(0)) {
            return;
        }

        const backsliceTxSignedWithBribe = await this._buildSignTxBySwaps(backsliceSwaps, nextBaseFee, nonce + 1, bribeAmount);
        // logSuccess("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", backsliceSwaps.length);
        const bundleResp = await sendBundleFlashbots(
            [frontsliceTxSigned, ...middleRawTxs, backsliceTxSignedWithBribe],
            targetBlockNumber
        );
        logSuccess(JSON.stringify(backsliceSwaps));
        logSuccess("Bundle submitted!", backsliceSwaps.length, JSON.stringify(bundleResp));

        // logSuccess('_submitBundles revenue', ethers.utils.formatUnits(revenue, 'ether'));
    }
    _updateSandwichBundle(key, sandwichBundle) {
        this._sandwichBundles.set(key, sandwichBundle);
        this._submitBundles();
    }
    _setTargetBlockNumber(targetBlockNumber) {
        if (this.targetBlockNumber != targetBlockNumber) {
            this._sandwichBundles.clear();
            this.targetBlockNumber = targetBlockNumber;
            this.replacementUuid = null;
        }
    }

    async _buildSignTxBySwaps(swaps, nextBaseFee, nonce, toCoinebase = 0) {
        if (swaps.length === 0) {
            return null;
        }
        const payload = this._buildPayload(swaps, toCoinebase);
        const tx = {
            to: CONTRACTS.SANDWICH,
            from: searcherWallet.address,
            data: payload,
            chainId: 1,
            maxPriorityFeePerGas: 0,
            maxFeePerGas: nextBaseFee,
            gasLimit: 250000 * swaps.length,
            nonce: nonce,
            type: 2,
        }
        const txSigned = await searcherWallet.signTransaction(tx);
        return txSigned;
    }
    _buildPayload(swaps, toCoinebase = 0) {
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
}
export class Swap {
    constructor(token, pair, amountIn, amountOut, tokenOutNo) {
        this.token = token;
        this.pair = pair;
        this.amountIn = amountIn;
        this.amountOut = amountOut;
        this.tokenOutNo = tokenOutNo;
    }
}