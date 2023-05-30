pragma solidity ^0.8.0;

import "openzeppelin/token/ERC20/IERC20.sol";
import "openzeppelin/access/Ownable.sol";
import "openzeppelin/utils/math/SafeMath.sol";

import "forge-std/console.sol";

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint) external;
}

interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    function swap(
        uint amount0Out,
        uint amount1Out,
        address to,
        bytes calldata data
    ) external;

    function token0() external view returns (address);

    function token1() external view returns (address);
}

contract MutiSwap is Ownable {
    using SafeMath for uint256;
    address public immutable WETH_ADDRESS;

    constructor(address _wethAddress) {
        WETH_ADDRESS = _wethAddress;
    }

    struct SwapInfo {
        address pair;
        uint256 amountIn;
        uint256 amountOut;
        bool isZeroOut;
    }

    function multi_swap(
        SwapInfo[] memory _swaps,
        uint256 payToCoinbase
    ) external onlyOwner {
        for (uint i = 0; i < _swaps.length; i++) {
            SwapInfo memory swap = _swaps[i];
            if(swap.isZeroOut) {
                IUniswapV2Pair pair = IUniswapV2Pair(swap.pair);
                IERC20(pair.token1()).transfer(swap.pair, swap.amountIn);
                pair.swap(swap.amountOut, 0, address(this), "");
                console.log('balance',IERC20(pair.token0()).balanceOf(address(this)));
            } else {
                IUniswapV2Pair pair = IUniswapV2Pair(swap.pair);
                IERC20(pair.token0()).transfer(swap.pair, swap.amountIn);
                pair.swap(0, swap.amountOut, address(this), "");
                console.log('balance',IERC20(pair.token1()).balanceOf(address(this)));
            }
            
        }
        if (payToCoinbase > 0) {
            IWETH(WETH_ADDRESS).withdraw(payToCoinbase);
            block.coinbase.transfer(payToCoinbase);
        }
    }

    /// @notice Transfers all WETH held by the contract to the contract owner.
    /// @dev Only the contract owner can call this function.
    function withdrawWETHToOwner() external onlyOwner {
        uint256 balance = IERC20(WETH_ADDRESS).balanceOf(address(this));
        IERC20(WETH_ADDRESS).transfer(msg.sender, balance);
    }

    /// @notice Transfers all ETH held by the contract to the contract owner.
    /// @dev Only the contract owner can call this function.
    function withdrawETHToOwner() external onlyOwner {
        uint256 balance = address(this).balance;
        payable(msg.sender).transfer(balance);
    }

    /// @notice Executes a call to another contract with the provided data and value.
    /// @dev Only the contract owner can call this function.
    /// @dev Reverted calls will result in a revert.
    /// @param _to The address of the contract to call.
    /// @param _value The amount of Ether to send with the call.
    /// @param _data The calldata to send with the call.
    function call(
        address payable _to,
        uint256 _value,
        bytes memory _data
    ) external onlyOwner {
        (bool success, ) = _to.call{value: _value}(_data);
        require(success, "External call failed");
    }

    /// @notice Fallback function that allows the contract to receive Ether.
    receive() external payable {}
}
