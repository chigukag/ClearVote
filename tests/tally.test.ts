import { describe, it, expect, beforeEach } from "vitest";

interface VoteTally {
	count: bigint;
}

interface ElectionResult {
	winners: string[];
	totalVotes: bigint;
}

interface ElectionDetails {
	electionId: bigint;
	ballotContract: string;
	revealEndTime: bigint;
	quorum: bigint;
	totalVoters: bigint;
	isFinalized: boolean;
	isActive: boolean;
}

interface MockBallotContract {
	getElectionDetails: () =>
		| { value: { choices: string[] } }
		| { error: number };
	getVoteCount: (choice: string) => { value: bigint } | { error: number };
}

interface MockContract {
	electionId: bigint;
	factoryContract: string;
	ballotContract: string;
	revealEndTime: bigint;
	quorum: bigint;
	totalVoters: bigint;
	isFinalized: boolean;
	isActive: boolean;
	voteTallies: Map<string, VoteTally>;
	electionResults: Map<string, ElectionResult>;
	blockHeight: bigint;
	initialize(
		caller: string,
		id: bigint,
		ballot: string,
		revealEnd: bigint,
		quorum: bigint,
		voters: bigint,
		choices: string[]
	): { value: boolean } | { error: number };
	finalizeElection(caller: string): { value: string[] } | { error: number };
	getElectionResults(id: bigint): { value: ElectionResult } | { error: number };
	getVoteTally(choice: string): { value: bigint } | { error: number };
	getElectionDetails(): { value: ElectionDetails };
}

const mockBallotContract: MockBallotContract = {
	getElectionDetails: () => ({
		value: { choices: ["Choice 1", "Choice 2"] },
	}),
	getVoteCount: (choice: string) => ({
		value: choice === "Choice 1" ? 5n : choice === "Choice 2" ? 3n : 0n,
	}),
};

const mockContract: MockContract = {
	electionId: 0n,
	factoryContract: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
	ballotContract: "ST2CY5...",
	revealEndTime: 0n,
	quorum: 0n,
	totalVoters: 0n,
	isFinalized: false,
	isActive: false,
	voteTallies: new Map(),
	electionResults: new Map(),
	blockHeight: 100n,
	initialize(
		caller: string,
		id: bigint,
		ballot: string,
		revealEnd: bigint,
		quorum: bigint,
		voters: bigint,
		choices: string[]
	) {
		if (caller !== this.factoryContract) return { error: 300 };
		if (id <= 0n) return { error: 301 };
		if (ballot === "SP000000000000000000002Q6VF78") return { error: 305 };
		if (revealEnd <= this.blockHeight) return { error: 302 };
		if (quorum > 100n) return { error: 308 };
		if (choices.length < 2) return { error: 308 };
		this.electionId = id;
		this.ballotContract = ballot;
		this.revealEndTime = revealEnd;
		this.quorum = quorum;
		this.totalVoters = voters;
		this.isActive = true;
		choices.forEach((choice) => this.voteTallies.set(choice, { count: 0n }));
		return { value: true };
	},
	finalizeElection(caller: string) {
		if (caller !== this.factoryContract) return { error: 300 };
		if (this.isFinalized) return { error: 304 };
		if (!this.isActive) return { error: 301 };
		if (this.blockHeight < this.revealEndTime) return { error: 302 };
		const ballotDetails = mockBallotContract.getElectionDetails();
		if ("error" in ballotDetails) return { error: 306 };
		const choices = ballotDetails.value.choices;
		let totalVotes = 0n;
		const voteCounts = choices.map((choice) => {
			const countResult = mockBallotContract.getVoteCount(choice);
			if ("error" in countResult) return 0n;
			totalVotes += countResult.value;
			return countResult.value;
		});
		if (totalVotes === 0n) return { error: 307 };
		const quorumMet =
			this.totalVoters === 0n
				? false
				: totalVotes * 100n >= this.quorum * this.totalVoters;
		if (!quorumMet) return { error: 303 };
		// Convert bigint voteCounts to number for Math.max
		const maxVotes = Math.max(...voteCounts.map(Number));
		// Compare as numbers to avoid type mismatch
		const winners = choices.filter(
			(_, i) => Number(voteCounts[i]) === maxVotes
		);
		this.electionResults.set(this.electionId.toString(), {
			winners,
			totalVotes,
		});
		this.isFinalized = true;
		this.isActive = false;
		return { value: winners };
	},
	getElectionResults(id: bigint) {
		const result = this.electionResults.get(id.toString());
		if (!result) return { error: 301 };
		return { value: result };
	},
	getVoteTally(choice: string) {
		const tally = this.voteTallies.get(choice);
		if (!tally) return { error: 308 };
		return { value: tally.count };
	},
	getElectionDetails() {
		return {
			value: {
				electionId: this.electionId,
				ballotContract: this.ballotContract,
				revealEndTime: this.revealEndTime,
				quorum: this.quorum,
				totalVoters: this.totalVoters,
				isFinalized: this.isFinalized,
				isActive: this.isActive,
			},
		};
	},
};

describe("Tally Contract", () => {
	beforeEach(() => {
		mockContract.electionId = 0n;
		mockContract.factoryContract = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
		mockContract.ballotContract = "ST2CY5...";
		mockContract.revealEndTime = 0n;
		mockContract.quorum = 0n;
		mockContract.totalVoters = 0n;
		mockContract.isFinalized = false;
		mockContract.isActive = false;
		mockContract.voteTallies = new Map();
		mockContract.electionResults = new Map();
		mockContract.blockHeight = 100n;
	});

	it("should initialize tally with valid parameters", () => {
		const result = mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		expect(result).toEqual({ value: true });
		expect(mockContract.getElectionDetails().value).toMatchObject({
			electionId: 1n,
			ballotContract: "ST2CY5...",
			revealEndTime: 400n,
			quorum: 50n,
			totalVoters: 10n,
			isActive: true,
			isFinalized: false,
		});
		expect(mockContract.voteTallies.get("Choice 1")).toEqual({ count: 0n });
	});

	it("should prevent non-factory from initializing", () => {
		const result = mockContract.initialize(
			"ST3NB...",
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		expect(result).toEqual({ error: 300 });
	});

	it("should prevent initialization with invalid election ID", () => {
		const result = mockContract.initialize(
			mockContract.factoryContract,
			0n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		expect(result).toEqual({ error: 301 });
	});

	it("should prevent initialization with zero address", () => {
		const result = mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"SP000000000000000000002Q6VF78",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		expect(result).toEqual({ error: 305 });
	});

	it("should finalize election with quorum met", () => {
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 500n;
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ value: ["Choice 1"] });
		expect(mockContract.getElectionResults(1n)).toMatchObject({
			value: { winners: ["Choice 1"], totalVotes: 8n },
		});
		expect(mockContract.getElectionDetails().value.isFinalized).toBe(true);
		expect(mockContract.getElectionDetails().value.isActive).toBe(false);
	});

	it("should prevent finalization before reveal period ends", () => {
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 300n;
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ error: 302 });
	});

	it("should prevent finalization if quorum not met", () => {
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			90n, // High quorum
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 500n;
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ error: 303 });
	});

	it("should prevent finalization if already finalized", () => {
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 500n;
		mockContract.finalizeElection(mockContract.factoryContract);
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ error: 304 });
	});

	it("should prevent finalization with no votes", () => {
		mockBallotContract.getVoteCount = () => ({ value: 0n });
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 500n;
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ error: 307 });
	});

	it("should handle tie in election results", () => {
		mockBallotContract.getVoteCount = () => ({ value: 4n }); // Equal votes
		mockContract.initialize(
			mockContract.factoryContract,
			1n,
			"ST2CY5...",
			400n,
			50n,
			10n,
			["Choice 1", "Choice 2"]
		);
		mockContract.blockHeight = 500n;
		const result = mockContract.finalizeElection(mockContract.factoryContract);
		expect(result).toEqual({ value: ["Choice 1", "Choice 2"] });
		expect(mockContract.getElectionResults(1n)).toMatchObject({
			value: { winners: ["Choice 1", "Choice 2"], totalVotes: 8n },
		});
	});
});
