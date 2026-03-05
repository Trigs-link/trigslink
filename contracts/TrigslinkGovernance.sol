// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Interface to communicate with your existing TrigslinkVault
interface ITrigslinkVault {
    function createMarket(string calldata _marketId, string calldata _question, string calldata _dataSource) external;
}

contract TrigslinkGovernance is ReentrancyGuard {
    IERC20 public trigsToken; // Kept so token holders still control the voting
    ITrigslinkVault public vault;

    uint256 public proposalStakeRequired; // e.g., 0.01 ether (Native Gas)
    uint256 public votingPeriod;          // e.g., 24 hours
    address payable public treasury;      // Where slashed ETH goes

    uint256 public proposalCount;

    struct Proposal {
        uint256 id;
        string marketId;
        string question;
        string dataSource;
        address payable creator; // Must be payable to receive the ETH refund
        uint256 endTime;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
        bool spam;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event MarketProposed(uint256 indexed proposalId, string marketId, address indexed creator, string question, uint256 stakeAmount);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event MarketExecuted(uint256 indexed proposalId, string marketId, bool passed);

    constructor(address _trigsToken, address _vault, address payable _treasury, uint256 _stakeRequired) {
        trigsToken = IERC20(_trigsToken);
        vault = ITrigslinkVault(_vault);
        treasury = _treasury;
        proposalStakeRequired = _stakeRequired; // Set this to something like 0.01 ether
        votingPeriod = 24 hours; 
    }

    /**
     * @dev Step 1: User sends Native Gas (ETH/MATIC) to propose a new market.
     */
    function proposeMarket(string calldata _marketId, string calldata _question, string calldata _dataSource) external payable nonReentrant {
        // Enforce the exact Native Gas stake requirement
        require(msg.value == proposalStakeRequired, "Incorrect ETH stake amount sent");

        proposalCount++;
        
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            marketId: _marketId,
            question: _question,
            dataSource: _dataSource,
            creator: payable(msg.sender), // Store as payable for the refund
            endTime: block.timestamp + votingPeriod,
            yesVotes: 0,
            noVotes: 0,
            executed: false,
            spam: false
        });

        emit MarketProposed(proposalCount, _marketId, msg.sender, _question, msg.value);
    }

    /**
     * @dev Step 2: Community votes YES or NO. Weight is based on their TRIGS token balance.
     */
    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage proposal = proposals[_proposalId];
        
        require(block.timestamp < proposal.endTime, "Voting period has ended");
        require(!hasVoted[_proposalId][msg.sender], "You have already voted");

        // Voting power is determined by token holdings (1 token = 1 vote)
        uint256 voterWeight = trigsToken.balanceOf(msg.sender);
        require(voterWeight > 0, "No voting power. You must hold TRIGS.");

        if (_support) {
            proposal.yesVotes += voterWeight;
        } else {
            proposal.noVotes += voterWeight;
        }

        hasVoted[_proposalId][msg.sender] = true;

        emit Voted(_proposalId, msg.sender, _support, voterWeight);
    }

    /**
     * @dev Step 3: Tally votes. If passed, deploy market & refund ETH. If failed, send ETH to treasury.
     */
    function executeProposal(uint256 _proposalId) external nonReentrant {
        Proposal storage proposal = proposals[_proposalId];

        require(block.timestamp >= proposal.endTime, "Voting is still active");
        require(!proposal.executed, "Proposal already executed");

        proposal.executed = true;

        // Consensus logic: More YES votes than NO votes
        if (proposal.yesVotes > proposal.noVotes) {
            // Deploy the market to the main Vault!
            vault.createMarket(proposal.marketId, proposal.question, proposal.dataSource);
            
            // Refund the Native ETH stake back to the creator
            (bool success, ) = proposal.creator.call{value: proposalStakeRequired}("");
            require(success, "ETH Refund failed");
            
            emit MarketExecuted(_proposalId, proposal.marketId, true);
        } else {
            // The community rejected it. Slash the ETH and send to the protocol treasury.
            proposal.spam = true;
            
            (bool success, ) = treasury.call{value: proposalStakeRequired}("");
            require(success, "ETH Slashing transfer failed");
            
            emit MarketExecuted(_proposalId, proposal.marketId, false);
        }
    }
}