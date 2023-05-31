const multiSwapAddress = '0x43ca9bae8df108684e5eaaa720c25e1b32b0a075';
// 替换为您的 WETH 合约地址
const wethContractAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
//require ethers
const { ethers } = require('ethers');
//require the abi
const multiswapAbi = require('../out/multiSwapOptimized.sol/MultiSwapOptimized.json').abi;
const wethContractABI = require('../out/multiSwapOptimized.sol/IWETH.json').abi;
// 替换为您的私钥
const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function main() {
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    // 使用私钥创建一个以太坊钱包
    let wallet = new ethers.Wallet(privateKey, provider);
    // 获取钱包地址
    const walletAddress = wallet.address;
    let balance = await wallet.getBalance();


    // 打印余额
    console.log('Wallet Address:', walletAddress);
    console.log('Balance:', ethers.utils.formatEther(balance));
    // 使用合约地址和 ABI 创建 WETH 合约实例
    const wethContract = new ethers.Contract(wethContractAddress, wethContractABI, wallet);
    // 将 ETH 转换为 WETH
    const ethAmount = ethers.utils.parseEther('1'); // 转换为 1 ETH
    const wethAmount = ethAmount; // 转换相同数量的 ETH
    // await wethContract.deposit({ value: wethAmount });
    // // 发送 WETH 到目标地址
    // await wethContract.transfer(multiSwapAddress, wethAmount);

    const multiSwapContract = new ethers.Contract(multiSwapAddress, multiswapAbi, wallet);

    // Craft our payload
    // 构建 Swap 数组
    const swaps = [
        {
            token: wethContractAddress,
            pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
            amountIn: '1000000000000000000',
            amountOut: 1896830188,
            tokenOutNo: 1
        },
        // {
        //     token: wethContractAddress,
        //     pair: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
        //     amountIn: '1000000000000000000',
        //     amountOut: 1886830188,
        //     tokenOutNo: 1
        // },
        // {
        //     token: wethContractAddress,
        //     pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
        //     amountIn: '1000000000000000222',
        //     amountOut: 1876830188,
        //     tokenOutNo: 1
        // },
        // {
        //     token: wethContractAddress,
        //     pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
        //     amountIn: '1000000000000000222',
        //     amountOut: 1876830188,
        //     tokenOutNo: 1
        // }
    ];
    // 构建 payload
    const frontslicePayload = buildPayload(swaps);
    const nonce = await provider.getTransactionCount(wallet.address);
    const frontsliceTx = {
        to: multiSwapAddress,
        from: wallet.address,
        data: frontslicePayload,
        chainId: 1,
        maxPriorityFeePerGas: 0,
        maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
        gasLimit: 250000,
        nonce,
        type: 2,
    };

    const frontsliceTxSigned = await wallet.signTransaction(frontsliceTx);
    // console.log(frontsliceTxSigned);
    let tx = await provider.sendTransaction(frontsliceTxSigned);
    const { gasUsed } = await tx.wait();
    console.log('0x0000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc206da0fd433c1a5d7a4faa01111c044910a18455300000000000000000de0b6b3a7640000000000000000000000000000710f54ec01');
    console.log(tx.data);
    console.log(gasUsed.toString());




    balance = await wethContract.balanceOf(multiSwapAddress);
    console.log('WETH Balance:', ethers.utils.formatEther(balance));




}
function buildPayload(swaps) {
    let payload = ethers.utils.defaultAbiCoder.encode(['uint8'], [swaps.length]);

    for (let i = 0; i < swaps.length; i++) {
        const swap = swaps[i];
        ethers.utils.defaultAbiCoder.encod
        const swapData = ethers.utils.solidityPack(
            ['address', 'address', 'uint128', 'uint128', 'uint8'],
            [swap.token, swap.pair, swap.amountIn, swap.amountOut, swap.tokenOutNo]
        );
        payload = ethers.utils.concat([payload, swapData]);
    }

    return payload;
}
main();