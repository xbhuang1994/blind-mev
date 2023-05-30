pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/TokenForTesting.sol";
import "../src/blindBackrunDebug.sol";
import "openzeppelin/token/ERC20/IERC20.sol";
import "openzeppelin/token/ERC20/ERC20.sol";
import "../src/multiSwap.sol";

error Unauthorized();

interface IUniswapFactory {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}

interface IUniswapV2Router {
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        payable
        returns (uint amountToken, uint amountETH, uint liquidity);
}

contract BlindBackrunTest is Test {
    using SafeMath for uint256;
    struct PairReserves {
        uint256 reserve0;
        uint256 reserve1;
        uint256 price;
        bool isWETHZero;
    }

    BlindBackrun public blindBackrun;
    MutiSwap public mutiSwap;
    address uniswapV2RouterAddress =
        address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    address sushiswapRouterAddress =
        address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F);
    IUniswapV2Router public uniswapv2Router =
        IUniswapV2Router(uniswapV2RouterAddress);
    IUniswapV2Router public sushiswapRouter =
        IUniswapV2Router(sushiswapRouterAddress);

    address uniswapv2FactoryAddress =
        address(0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f);
    address sushiswapFactoryAddress =
        address(0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac);
    IUniswapFactory public uniswapFactory =
        IUniswapFactory(uniswapv2FactoryAddress);
    IUniswapFactory public sushiswapFactory =
        IUniswapFactory(sushiswapFactoryAddress);

    address wethTokenAddress =
        address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address usdcTokenAddress =
        address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    address usdtTokenAddress =
        address(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    IWETH WETH = IWETH(wethTokenAddress);

    function setUp() public {
        blindBackrun = new BlindBackrun(wethTokenAddress); // WETH address on
        mutiSwap = new MutiSwap(wethTokenAddress);
        vm.deal(address(msg.sender), 1e25);
        WETH.deposit{value: 1e23}();
        WETH.transfer(address(blindBackrun), 1e23);
        WETH.deposit{value: 1e23}();
        WETH.transfer(address(mutiSwap), 1e23);
        
    }

    function test_mainnetMutiSwap() public {
        address[] memory pairs = new address[](2);
        pairs[0] = address(0x06da0fd433C1A5d7a4faa01111c044910A184553);
        pairs[1] = address(0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852);
        uint256[] memory amountIns = new uint256[](2);
        amountIns[0] = 1e18;
        amountIns[1] = 1e18;
        uint256[] memory amountOuts = new uint256[](2);
        IUniswapV2Pair2 firstPair = IUniswapV2Pair2(pairs[0]);
        IUniswapV2Pair2 secondPair = IUniswapV2Pair2(pairs[1]);

        IPairReserves.PairReserves memory firstPairData = blindBackrun
            .getPairData(firstPair);
        IPairReserves.PairReserves memory secondPairData = blindBackrun
            .getPairData(secondPair);
        amountOuts[0] = blindBackrun.getAmountOut(
            amountIns[0],
            firstPairData.reserve0,
            firstPairData.reserve1
        );
        amountOuts[1] = blindBackrun.getAmountOut(
            amountIns[1],
            secondPairData.reserve0,
            secondPairData.reserve1
        );
        console.log(amountIns[0], amountOuts[0]);
        MutiSwap.SwapInfo[] memory swaps = new MutiSwap.SwapInfo[](2);
        // Initialize the SwapInfo struct
        MutiSwap.SwapInfo memory swap0 = MutiSwap.SwapInfo({
            pair: pairs[0],
            amountIn: 1e18,
            amountOut: amountOuts[0],
            isZeroOut: false
        });
        MutiSwap.SwapInfo memory swap1 = MutiSwap.SwapInfo({
            pair: pairs[1],
            amountIn: 1e18,
            amountOut: amountOuts[1],
            isZeroOut: false
        });
        swaps[0] = swap0;
        swaps[1] = swap1;
        uint256 startGas = gasleft();
        mutiSwap.multi_swap(swaps, 0);
        uint256 endGas = gasleft();
        uint256 gasConsumed = startGas - endGas;
        console.log("multi_swap gas :", gasConsumed);
    }
}
