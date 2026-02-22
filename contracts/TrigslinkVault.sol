// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract TrigslinkVault {
    address public trigslinkManager;

    struct Market {
        string marketId;
        bool resolved;
        uint8 finalOutcome;
        uint256 totalPool;
        uint256 outcome1Pool;
        uint256 outcome2Pool;
    }

    mapping(string => Market) public markets;

    // Mapping: marketId => userAddress => outcome(1 or 2) => amountBet
    mapping(string => mapping(address => mapping(uint8 => uint256))) public userBets;

    event BetPlaced(string indexed marketId, address indexed user, uint256 amount);
    event MarketResolved(string indexed marketId, uint8 outcome);

    constructor(){
        owner = msg.sender;
    }

    function placeBet(string memory _marketId) external payable {
        require(msg.value > 0, "Bet must be greater than 0");
        require(!markets[_marketId].resolved, "Market already settled");

        if (markets[_marketId].totalPool == 0) {
            markets[_marketId].marketId = _marketId;
        }

        markets[_marketId].totalPool += msg.value;
        userBets[_marketId][msg.sender] += msg.value;
        
        emit BetPlaced(_marketId, msg.sender, msg.value);
    }

    function resolveMarket(string memory _marketId, uint8 _outcome) external {
        require(msg.sender == owner, "Only owner can resolve");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome");

        markets[_marketId].resolved = true;
        markets[_marketId].finalOutcome = _outcome;

        emit MarketResolved(_marketId, _outcome);

    }
}