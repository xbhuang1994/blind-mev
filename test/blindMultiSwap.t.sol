pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/TokenForTesting.sol";
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
        mutiSwap = new MutiSwap(wethTokenAddress);
        vm.deal(address(msg.sender), 1e25);
        WETH.deposit{value: 1e23}();
        WETH.transfer(address(mutiSwap), 1e23);
        
    }

    function test_mainnetMutiSwap() public {
        MutiSwap.SwapInfo[] memory swaps2 = new MutiSwap.SwapInfo[](4);
        swaps2[0] = MutiSwap.SwapInfo({pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000000, amountOut: 1896830188, tokenOutNo: 1});
        swaps2[1] = MutiSwap.SwapInfo({pair: 0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852, amountIn: 1000000000000000000, amountOut: 1886830188, tokenOutNo: 1});
        swaps2[2] = MutiSwap.SwapInfo({pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1786830188, tokenOutNo: 1});
        swaps2[3] = MutiSwap.SwapInfo({pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1786830188, tokenOutNo: 1});
        uint256 startGas1 = gasleft();
        mutiSwap.multi_swap(swaps2);
        uint256 endGas1 = gasleft();
        uint256 gasConsumed1 = startGas1 - endGas1;
        console.log("multi_swap gas :", gasConsumed1);
    }
}
