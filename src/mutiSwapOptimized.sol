pragma solidity ^0.8.0;

import "openzeppelin/token/ERC20/IERC20.sol";
import "openzeppelin/access/Ownable.sol";
import "openzeppelin/utils/math/SafeMath.sol";

import "forge-std/console.sol";

interface IWETH is IERC20 {
    function deposit() external payable;

    function withdraw(uint) external;
}

contract MutiSwapOptimized is Ownable {
    event LogMessage(uint256 numSwaps);
    using SafeMath for uint256;
    // transfer(address,uint256)
    bytes4 internal constant ERC20_TRANSFER_ID = 0xa9059cbb;

    // swap(uint256,uint256,address,bytes)
    bytes4 internal constant PAIR_SWAP_ID = 0x022c0d9f;

    constructor() {}

    /// @notice Transfers all WETH held by the contract to the contract owner.
    /// @dev Only the contract owner can call this function.
    function withdrawErc20ToOwner(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(msg.sender, balance);
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

    fallback() external payable {
        address memUser = owner();
        uint256 value = msg.value;
        assembly {
            // You can only access teh fallback function if you're authorized
            if iszero(eq(caller(), memUser)) {
                // Ohm (3, 3) makes your code more efficient
                // WGMI
                revert(3, 3)
            }
            // // Extract number of swaps
            let numSwaps := calldataload(0x00)

            for {
                let i := 0
            } lt(i, numSwaps) {
                i := add(i, 1)
            } {
                // Extract variables for swap[i]

                let token := shr(96, calldataload(add(0x20, mul(i, 0x49))))
                let pair := shr(96, calldataload(add(0x34, mul(i, 0x49))))
                let amountIn := shr(128, calldataload(add(0x48, mul(i, 0x49))))
                let amountOut := shr(128, calldataload(add(0x58, mul(i, 0x49))))
                let tokenOutNo := shr(
                    248,
                    calldataload(add(0x68, mul(i, 0x49)))
                )

                // **** calls token.transfer(pair, amountIn) ****
                // transfer function signature
                mstore(0x7c, ERC20_TRANSFER_ID)
                // destination
                mstore(0x80, pair)
                // amount
                mstore(0xa0, amountIn)

                let s1 := call(sub(gas(), 5000), token, 0, 0x7c, 0x44, 0, 0)
                if iszero(s1) {
                    // WGMI
                    revert(3, 3)
                }

                // ************
                /* 
                    calls pair.swap(
                        tokenOutNo == 0 ? amountOut : 0,
                        tokenOutNo == 1 ? amountOut : 0,
                        address(this),
                        new bytes(0)
                    )
                */
                // swap function signature
                mstore(0x7c, PAIR_SWAP_ID)
                // tokenOutNo == 0 ? ....
                switch tokenOutNo
                case 0 {
                    mstore(0x80, amountOut)
                    mstore(0xa0, 0)
                }
                case 1 {
                    mstore(0x80, 0)
                    mstore(0xa0, amountOut)
                }
                // address(this)
                mstore(0xc0, address())
                // empty bytes
                mstore(0xe0, 0x80)

                let s2 := call(sub(gas(), 5000), pair, 0, 0x7c, 0xa4, 0, 0)
                if iszero(s2) {
                    revert(3, 3)
                }
            }
            // check if the value is nonzero
            if iszero(iszero(value)) {
                // call the transfer function with gas limit 2300 (stipend for .transfer)
                // send msg.value wei to the address in block.coinbase
                // first argument is gas, second is address, third is value
                let success := call(2300, coinbase(), value, 0, 0, 0, 0)

                // check if the call was successful, if not, revert the transaction
                if iszero(success) {
                    revert(3, 3)
                }
            }
        }
    }

    // Contructor sets the only user
    receive() external payable {}
}
