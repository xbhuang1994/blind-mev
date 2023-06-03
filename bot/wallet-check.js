import { ethers } from "ethers";
import { wssProvider,CONTRACTS, searcherWallet,wethContract } from "./src/constants.js";
const main = async () => {
    while (true) {
        let sandwichBlance = await wssProvider.getBalance(CONTRACTS.SANDWICH);
        let walletBlance = await searcherWallet.getBalance();
        let wethBlance = await wethContract.balanceOf(CONTRACTS.SANDWICH);
        let totalBlance = sandwichBlance.add(sandwichBlance).add(wethBlance);
        // console.log(walletBlance.toString(),sandwichBlance.toString(),wethBlance.toString());
        console.log("ETH TOTAL:",ethers.utils.formatEther(totalBlance));
        await sleep(1000 * 60);
    }
}
main();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }