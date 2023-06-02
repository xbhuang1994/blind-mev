// SPDX-License-Identifier: MIT
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
        vm.deal(address(multiSwapOptimized), 1e23);
        WETH.deposit{value: 1e23}();
        WETH.transfer(address(multiSwapOptimized), 1e23);
    }

    function test_multiSwapOp() public {
        Swap[] memory swaps = new Swap[](1);
        swaps[0] = Swap({token: wethTokenAddress, pair: 0x40643d019BcB381800F0C2D593a4a6472cCd7493, amountIn: 1000000000000000000, amountOut: 1756830180, tokenOutNo: 1});
        // swaps[1] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000000, amountOut: 1756830180, tokenOutNo: 1});
        // swaps[0] = Swap({token: wethTokenAddress, pair: 0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852, amountIn: 1000000000000000001, amountOut: 1786830181, tokenOutNo: 1});
        // swaps[2] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1756830180, tokenOutNo: 1});
        // swaps[3] = Swap({token: wethTokenAddress, pair: 0x06da0fd433C1A5d7a4faa01111c044910A184553, amountIn: 1000000000000000222, amountOut: 1756830180, tokenOutNo: 1});
        //1000000000 * 1000000000 * 10
        bytes memory payload = buildPayload(swaps,1e18);
        uint256 _before = gasleft();
        (bool s, ) = address(multiSwapOptimized).call(payload);
        // (bool s1, ) = address(multiSwapOptimized).call(payload);
        uint256 _after = gasleft();
        multiSwapOptimized.withdrawETHToOwner();
        multiSwapOptimized.withdrawErc20ToOwner(wethTokenAddress);
        
        assertTrue(s);
        uint256 balance = address(multiSwapOptimized).balance;

        // emit log_uint(payload);
        console.log('123');
        emit log_bytes(payload);
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
    //to coinbase is gwei
    function buildPayload(
        Swap[] memory swaps,
        uint128 toCoinbase
    ) public pure returns (bytes memory) {
        uint8 len = uint8(swaps.length);
        bytes memory payload = abi.encodePacked(len);
        payload = abi.encodePacked(payload,toCoinbase);

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
    // Contructor sets the only user
    receive() external payable {}
}
