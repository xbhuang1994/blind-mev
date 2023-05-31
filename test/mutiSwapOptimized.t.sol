pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/TokenForTesting.sol";
import "openzeppelin/token/ERC20/IERC20.sol";
import "openzeppelin/token/ERC20/ERC20.sol";
import "../src/multiSwapOptimized.sol";
import "../src/interface/IUniswapV2.sol";

error Unauthorized();

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

contract MultiSwapOptimizedTest is Test {
    IUniswapV2Router02 univ2Router =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    address wethTokenAddress =
        address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    MultiSwapOptimized multiSwapOptimized;
    IWETH WETH = IWETH(wethTokenAddress);

    function setUp() public {
        multiSwapOptimized = new MultiSwapOptimized();
        vm.deal(address(msg.sender), 1e25);
        WETH.deposit{value: 1e23}();
        WETH.transfer(address(multiSwapOptimized), 1e23);
    }

    function test_multiSwapOp() public {
        Swap[] memory swaps = new Swap[](4);
        swaps[0] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000000, amountOut: 1896830188, tokenOutNo: 1});
        swaps[1] = Swap({token: wethTokenAddress, pair: 0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852, amountIn: 1000000000000000000, amountOut: 1886830188, tokenOutNo: 1});
        swaps[2] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1876830188, tokenOutNo: 1});
        swaps[3] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1876830188, tokenOutNo: 1});
        bytes memory payload = buildPayload(swaps);
        uint256 _before = gasleft();
        (bool s, ) = address(multiSwapOptimized).call(payload);
        uint256 _after = gasleft();
        assertTrue(s);
        uint balance = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7).balanceOf(address(multiSwapOptimized));

        emit log_string("optimized front slice gas used");
        emit log_uint(_before - _after);
        emit log_uint(balance);
    }

    struct Swap {
        address token;
        address pair;
        uint128 amountIn;
        uint128 amountOut;
        uint8 tokenOutNo;
    }

    function buildPayload(
        Swap[] memory swaps
    ) public pure returns (bytes memory) {
        bytes memory payload = abi.encodePacked(swaps.length);

        for (uint i = 0; i < swaps.length; i++) {
            payload = abi.encodePacked(
                payload,
                swaps[i].token,
                swaps[i].pair,
                swaps[i].amountIn,
                swaps[i].amountOut,
                swaps[i].tokenOutNo
            );
        }

        return payload;
    }
}
