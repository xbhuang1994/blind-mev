const multiSwapAddress = '0x4ea0be853219be8c9ce27200bdeee36881612ff2';
// 替换为您的 WETH 合约地址
const wethContractAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
//require ethers
const { ethers } = require('ethers');
//require the abi
const multiswapAbi = require('../out/multiSwapOptimized.sol/MultiSwapOptimized.json').abi;
const wethContractABI = require('../out/multiSwapOptimized.sol/IWETH.json').abi;
const erc20ContractABI = require('../out/ERC20.sol/ERC20.json').abi;
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
    const ethAmount = ethers.utils.parseEther('5'); // 转换为 1 ETH
    const wethAmount = ethAmount; // 转换相同数量的 ETH
    await wethContract.deposit({ value: wethAmount });
    // // 发送 WETH 到目标地址
    await wethContract.transfer(multiSwapAddress, wethAmount);
     // The amount of Ether to send (in wei)
    const amountToSend = ethers.utils.parseEther('1');

    // Send Ether to the recipient
    await wallet.sendTransaction({
        to: multiSwapAddress,
        value: amountToSend,
    });

    // const multiSwapContract = new ethers.Contract(multiSwapAddress, multiswapAbi, wallet);

    // Craft our payload
    // 构建 Swap 数组
    const swaps = [
        {
            token: wethContractAddress,
            pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
            amountIn: '1000000000000000000',
            amountOut: 1576830188,
            tokenOutNo: 1
        },
        {
            token: wethContractAddress,
            pair: '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852',
            amountIn: '1000000000000000000',
            amountOut: 1576830188,
            tokenOutNo: 1
        },
        {
            token: wethContractAddress,
            pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
            amountIn: '1000000000000000000',
            amountOut: 1576830188,
            tokenOutNo: 1
        },
        {
            token: wethContractAddress,
            pair: '0x06da0fd433C1A5d7a4faa01111c044910A184553',
            amountIn: '1000000000000000000',
            amountOut: 1576830188,
            tokenOutNo: 1
        }
    ];
    // 构建 payload
    const frontslicePayload = buildPayload(swaps,ethers.utils.parseEther('0'));
    const nonce = await provider.getTransactionCount(wallet.address);
    const frontsliceTx = {
        to: multiSwapAddress,
        from: wallet.address,
        data: frontslicePayload,
        chainId: 1,
        maxPriorityFeePerGas: 0,
        maxFeePerGas: ethers.utils.parseUnits('32', 'gwei'),
        gasLimit: 250000,
        nonce,
        type: 2,
    };

    let gasEstimate = await provider.estimateGas(frontsliceTx);
    gasEstimate = gasEstimate.mul(94).div(100); //offset for gas estimation diff
    console.log('gasEstimate:', gasEstimate.toString());
    const frontsliceTxSigned = await wallet.signTransaction(frontsliceTx);
    // console.log(frontsliceTxSigned);
    let tx = await provider.sendTransaction(frontsliceTxSigned);
    const { gasUsed } = await tx.wait();
    // console.log('0x0000000000000000000000000000000000000000000000000000000000000001c02aaa39b223fe8d0a0e5c4f27ead9083c756cc206da0fd433c1a5d7a4faa01111c044910a18455300000000000000000de0b6b3a7640000000000000000000000000000710f54ec01');
    console.log(tx.data);
    console.log('0x00000000000000d3c21bcecceda1000000');
    console.log('gasUsed:', gasUsed.toString());
    console.log(ethers.utils.formatEther(gasUsed.mul(frontsliceTx.maxFeePerGas)));
    balance = await wethContract.balanceOf(multiSwapAddress);
    let  wethBlance = await provider.getBalance(multiSwapAddress);
    // create a usdt contract instance and get balance of mutiswap contract
    const usdtContract = new ethers.Contract('0xdAC17F958D2ee523a2206206994597C13D831ec7', erc20ContractABI, wallet);
    let usdtBalance = await usdtContract.balanceOf(multiSwapAddress);
    const decimals = await usdtContract.decimals();
    console.log(decimals);
    console.log('usdtBalance:', ethers.utils.formatUnits(usdtBalance,decimals));
    
    
    console.log('ETH Balance:', ethers.utils.formatEther(wethBlance));
    console.log('WETH Balance:', ethers.utils.formatEther(balance));
}
function buildPayload(swaps,toCoinebase) {
    let payload = ethers.utils.solidityPack(['uint8','uint128'], [swaps.length,toCoinebase]);

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