// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {IERC20} from "@chainlink/contracts-ccip/src/v0.8/vendor/openzeppelin-solidity/v4.8.3/contracts/token/ERC20/IERC20.sol";

contract TrigslinkCCIP {
    IRouterClient public router;
    IERC20 public linkToken;

    mapping(uint64 => address) public destinationVaults;

    event CrossChainBetSent(
        bytes32 indexed messageId,
        uint64 indexed destainationChainSelector,
        string marketId,
        uint8 outcome,
        uint256 amount
    );

    constructor(address _router, address _linktoken) {
        router = IRouterClient(_router);
        linkToken = IERC20(_linktoken); 
    }

    function setDestinationVault (uint64 _chainselector, address _vault) external {
        
    }
}
