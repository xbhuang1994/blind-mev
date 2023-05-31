// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/multiSwapOptimized.sol";


contract MultiSwapOptimizedScript is Script {
    function run()  external {
        vm.startBroadcast();
        new MultiSwapOptimized();
        vm.stopBroadcast();
    }
}