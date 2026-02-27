// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24 ;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

//Interface to talk to your TrigslinkVault
interface ITrigslinkVault {
    function resolveMarket(string memory _marketId, uint8 _outcome) external;
}

contract TrigslinkManager is FunctionsClient{
    using FunctionsRequest for FunctionsRequest.Request;

    ITrigslinkVault public vault;

    //chainlink Configuration
    bytes32 public donId;
    uint64 public subscriptionId;
    string public aiVerificationSource;

    mapping(bytes32 => string) public pendingRequests;

    event ResolutionTriggered(string indexed marketId, bytes32 indexed requestId);
    event MarketResolvedByAI(string indexed  marketId, uint8 outcome);

    constructor(
        address router,
        bytes32 _donId,
        uint64 _subscriptionId,
        address _vaultAddress
    ) FunctionsClient(router) {
        donId = _donId;
        subscriptionId = _subscriptionId;
        vault = ITrigslinkVault(_vaultAddress);
    }

    function setAiVerificationSource(string memory _sourceCode) external{
        // Note: In production, add an onlyOwner modifier here
        aiVerificationSource = _sourceCode;
    }

    function triggerMarketResolution(string memory _marketId, string[] memory args) external returns (bytes32 requestId){
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(aiVerificationSource);

        // Pass the market question (e.g. "Will Trump say trump in his next speech") to the off-chain nodes
        if (args.length > 0 ) req.setArgs(args);

        // Send the request to the chainlink decentralised oracle network (DON)
        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            300000,
            donId
        );

        pendingRequests[requestId] = _marketId;
        emit ResolutionTriggered(_marketId, requestId);
    }

    // The 15 seconds window

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        string memory marketId = pendingRequests[requestId];
        require(bytes(marketId).length > 0, "Request not found");

        //Extended Verification Mode: If nodes disagree or API fails, pause.
        if (err.length > 0){
            revert("AI Grounding Failed/ No Consensus");
        }

        //Parse the outcome from the AI (Assuming AI returns 1 for YES and 2 for NO)
        uint8 outcome = abi.decode(response, (uint8));
        require(outcome == 1 || outcome == 2, "Invalid AI response");

        // Autonomous Execution : The TrigslinkManager tells the node who won and wo didn't
        vault.resolveMarket(marketId, outcome);

        emit MarketResolvedByAI(marketId, outcome); 
    }
}