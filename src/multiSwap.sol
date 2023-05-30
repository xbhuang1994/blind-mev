pragma solidity ^0.8.0;

import "openzeppelin/token/ERC20/IERC20.sol";
import "openzeppelin/access/Ownable.sol";
import "openzeppelin/utils/math/SafeMath.sol";
import "../src/interface/IUniswapV2.sol";
import "forge-std/console.sol";

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint) external;
}

contract MutiSwap is Ownable {
    using SafeMath for uint256;
    address public immutable WETH_ADDRESS;

    constructor(address _wethAddress) {
        WETH_ADDRESS = _wethAddress;
        
    }

    struct SwapInfo {
        address pair;
        uint128 amountIn;
        uint128 amountOut;
        uint8 tokenOutNo;
    }

    function multi_swap(
        SwapInfo[] memory _swaps
    ) external payable onlyOwner {
        for (uint i = 0; i < _swaps.length; i++) {
            SwapInfo memory swap = _swaps[i];
            IUniswapV2Pair pair = IUniswapV2Pair(swap.pair);
            if(swap.tokenOutNo == 0) {
                IERC20(pair.token1()).transfer(swap.pair, swap.amountIn);
                pair.swap(swap.amountOut, 0, address(this), "");
                // console.log('balance',IERC20(pair.token0()).balanceOf(address(this)));
            } else {
                IERC20(pair.token0()).transfer(swap.pair, swap.amountIn);
                pair.swap(0, swap.amountOut, address(this), '');
                // console.log('balance',IERC20(pair.token1()).balanceOf(address(this)));
            }
            
        }
        if (msg.value > 0) {
            block.coinbase.transfer(msg.value );
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
