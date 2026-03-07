// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Interface to communicate with your existing TrigslinkVault
interface ITrigslinkVault {
    function createMarket(string calldata _marketId, string calldata _question, string calldata _dataSource, uint256 _endTime) external;
}

contract TrigslinkGovernance is ReentrancyGuard {
    IERC20 public trigsToken; 
    ITrigslinkVault public vault;

    uint256 public proposalStakeRequired;
    uint256 public votingPeriod; 
    uint256 public successfulMarketReward; // The bonus ETH they get for a good market

    address payable public treasury;      
    address public creSpamNode; // The AI wallet authorized to flag spam

    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        string marketId;
        string question;
        string dataSource;
        uint256 marketEndTime;
        address payable creator; // Must be payable to receive the ETH refund
        uint256 votingEndTime;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
        bool isSpam;
        bool spamChecked;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event MarketProposed(uint256 indexed proposalId, string marketId, address indexed creator, string question, uint256 stakeAmount, uint256 marketEndTime);
    event SpamCheckCompleted(uint256 indexed proposalId, bool isSpam);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event MarketExecuted(uint256 indexed proposalId, string marketId, bool passed);

    constructor(address _trigsToken, address _vault, address payable _treasury, address _creSpamNode, uint256 _stakeRequired, uint256 _rewardAmount) {
        trigsToken = IERC20(_trigsToken);
        vault = ITrigslinkVault(_vault);
        treasury = _treasury;
        creSpamNode = _creSpamNode;
        proposalStakeRequired = _stakeRequired; // Set this to something like 0.01 ether
        successfulMarketReward = _rewardAmount;
        votingPeriod = 3 minutes; // ⏱ Hackathon fast-track

    }

    /**
     * @dev Step 1: User stakes ETH and defines the exact time the market will end.
     */
    function proposeMarket(string calldata _marketId, string calldata _question, string calldata _dataSource, uint256 _marketEndTime) external payable nonReentrant {
        require(msg.value == proposalStakeRequired, "Incorrect ETH stake amount sent");

        // Ensure the market doesn't end before the community even finishes voting
        require(_marketEndTime > block.timestamp + votingPeriod, "Market end time must be after the voting period");

        proposalCount++;
        
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            marketId: _marketId,
            question: _question,
            dataSource: _dataSource,
            marketEndTime: _marketEndTime,
            creator: payable(msg.sender), 
            votingEndTime: block.timestamp + votingPeriod,
            yesVotes: 0,
            noVotes: 0,
            executed: false,
            isSpam: false,
            spamChecked: false
        });

        emit MarketProposed(proposalCount, _marketId, msg.sender, _question, msg.value, _marketEndTime);
    }

    /**
     * @dev Step 2: The CRE AI Node immediately scans the question and calls this function.
     */
    function submitSpamCheck(uint256 _proposalId, bool _isSpam) external {
        require(msg.sender == creSpamNode, "Only CRE Node can verify spam");
        require(!proposals[_proposalId].spamChecked, "Already checked");

        proposals[_proposalId].isSpam = _isSpam;
        proposals[_proposalId].spamChecked = true;

        emit SpamCheckCompleted(_proposalId, _isSpam);
    }

    /**
     * @dev Step 3: Community votes YES or NO. Weight is based on their TRIGS token balance.
     */
    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage proposal = proposals[_proposalId];
        
        require(block.timestamp < proposal.votingEndTime, "Voting period has ended");
        require(!hasVoted[_proposalId][msg.sender], "You have already voted");
        require(!proposal.isSpam, "Proposal flagged as spam by AI");

        // Voting power is determined by token holdings (1 token = 1 vote)
        uint256 voterWeight = trigsToken.balanceOf(msg.sender);
        require(voterWeight > 0, "No voting power. You must hold $TRIGS.");

        if (_support) {
            proposal.yesVotes += voterWeight;
        } else {
            proposal.noVotes += voterWeight;
        }

        hasVoted[_proposalId][msg.sender] = true;

        emit Voted(_proposalId, msg.sender, _support, voterWeight);
    }

    /**
     * @dev Step 4: Tally votes. If passed, deploy market & refund ETH + reward. If failed, send ETH to treasury.
     */
    function executeProposal(uint256 _proposalId) external nonReentrant {
        Proposal storage proposal = proposals[_proposalId];

        require(block.timestamp >= proposal.votingEndTime, "Voting is still active");
        require(!proposal.executed, "Proposal already executed");
        require(proposal.spamChecked, "Awaiting AI spam verification");

        proposal.executed = true;
        
        // If the AI flagged it as spam, OR the community voted NO
        if (proposal.isSpam) {
            (bool success, ) = treasury.call{value: proposalStakeRequired}("");
            require(success, "Slashing transfer failed");
            emit MarketExecuted(_proposalId, proposal.marketId, false);
        
        } else if (proposal.yesVotes == 0 && proposal.noVotes == 0) {
            (bool success, ) = proposal.creator.call{value: proposalStakeRequired}("");
            require(success, "Refund failed");
            emit MarketExecuted(_proposalId, proposal.marketId, false);

        } else if (proposal.noVotes >= proposal.yesVotes) {
            (bool success, ) = treasury.call{value: proposalStakeRequired}("");
            require(success, "Slashing transfer failed");
            emit MarketExecuted(_proposalId, proposal.marketId, false);    


        } else {
            vault.createMarket(proposal.marketId, proposal.question, proposal.dataSource, proposal.marketEndTime);
            
            // THE EMPTY TREASURY FIX: Only pay the bonus if the contract has the ETH for it!
            uint256 totalPayout = proposalStakeRequired;
            if (address(this).balance >= successfulMarketReward) {
                totalPayout += successfulMarketReward;
            }
            
            (bool success, ) = proposal.creator.call{value: totalPayout}("");
            require(success, "Refund and reward failed");
            
            emit MarketExecuted(_proposalId, proposal.marketId, true);
        }
    }
            
            receive() external payable {}    
}
    