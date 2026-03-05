// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TrigslinkCrossChain {
    IRouterClient public router;
    IERC20 public linkToken;
    mapping(uint64 => address) public destinationVaults;

    event CrossChainBetSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        string marketId,
        uint8 outcome,
        uint256 amount
    );

    constructor(address _router, address _linktoken) {
        router = IRouterClient(_router);
        linkToken = IERC20(_linktoken); 
    }

    function setDestinationVault (uint64 _chainselector, address _vault) external {
        destinationVaults[_chainselector] = _vault;
    }

    function placeCrossChainBet(
        uint64 _destinationChainSelector,
        string memory _marketId,
        uint8 _outcome,
        address _tokenToBet,
        uint256 _betAmount
    ) external returns (bytes32 messageId) {
        address targetVault = destinationVaults[_destinationChainSelector];
        require(targetVault != address(0), "Destination Vault not set");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome" );

        IERC20(_tokenToBet).transferFrom(msg.sender, address(this), _betAmount);
        bytes memory payload = abi.encode(_marketId, _outcome, msg.sender);

        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({token: _tokenToBet, amount: _betAmount});

        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(targetVault),
            data: payload,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 400_000})),
            feeToken: address(linkToken)
        });

        uint256 fees = router.getFee(_destinationChainSelector, evm2AnyMessage);
        linkToken.transferFrom(msg.sender, address(this), fees);
        linkToken.approve(address(router), fees);
        IERC20(_tokenToBet).approve(address(router), _betAmount);

        messageId = router.ccipSend(_destinationChainSelector, evm2AnyMessage);
        emit CrossChainBetSent(messageId, _destinationChainSelector, _marketId, _outcome, _betAmount);
        return messageId;
    }
}
