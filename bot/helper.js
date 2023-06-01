import { multiSwapOptimized } from "./src/constants.js";
const main = async () => {
    console.log(multiSwapOptimized.functions);
    const owner = await multiSwapOptimized.owner();
    // let rep = await multiSwapOptimized.withdrawETHToOwner();
    let rep = await multiSwapOptimized.withdrawErc20ToOwner('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    console.log(rep);
    console.log(owner);
}
main();