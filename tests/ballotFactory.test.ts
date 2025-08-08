 
import { describe, it, expect, beforeEach } from "vitest";

interface Election {
	title: string;
	description: string;
	creator: string;
	startTime: bigint;
	commitEndTime: bigint;
	revealEndTime: bigint;
	quorum: bigint;
	choices: string[];
	ballotContract: string;
	tallyContract: string;
	isActive: boolean;
}

interface MockContract {
	admin: string;
	contractOwner: string;
	electionCounter: bigint;
	elections: Map<string, Election>;
	creatorElections: Map<string, { exists: boolean }>;
	isAdmin(caller: string): boolean;
	validatePrincipal(address: string): boolean;
	validateElectionParams(
		title: string,
		description: string,
		startTime: bigint,
		commitEndTime: bigint,
		revealEndTime: bigint,
		quorum: bigint,
		choices: string[]
	): boolean;
	transferAdmin(
		caller: string,
		newAdmin: string
	): { value: boolean } | { error: number };
	createElection(
		caller: string,
		title: string,
		description: string,
		startTime: bigint,
		commitEndTime: bigint,
		revealEndTime: bigint,
		quorum: bigint,
		choices: string[],
		ballotContract: string,
		tallyContract: string
	): { value: bigint } | { error: number };
	setElectionStatus(
		caller: string,
		electionId: bigint,
		isActive: boolean
	): { value: boolean } | { error: number };
	getElection(electionId: bigint): { value: Election } | { error: number };
}

const mockContract: MockContract = {
	admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
	contractOwner: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
	electionCounter: 0n,
	elections: new Map(),
	creatorElections: new Map(),
	isAdmin(caller: string) {
		return caller === this.admin;
	},
	validatePrincipal(address: string) {
		return address !== "SP000000000000000000002Q6VF78";
	},
	validateElectionParams(
		title: string,
		description: string,
		startTime: bigint,
		commitEndTime: bigint,
		revealEndTime: bigint,
		quorum: bigint,
		choices: string[]
	) {
		return (
			title.length >= 1 &&
			title.length <= 200 &&
			description.length <= 1000 &&
			startTime > 100n &&
			commitEndTime > startTime &&
			revealEndTime > commitEndTime &&
			quorum <= 100n &&
			choices.length >= 2 &&
			choices.length <= 10 &&
			choices.every((choice) => choice.length >= 1 && choice.length <= 100)
		);
	},
	transferAdmin(caller: string, newAdmin: string) {
		if (!this.isAdmin(caller)) return { error: 106 };
		if (!this.validatePrincipal(newAdmin)) return { error: 107 };
		this.admin = newAdmin;
		return { value: true };
	},
	createElection(
		caller: string,
		title: string,
		description: string,
		startTime: bigint,
		commitEndTime: bigint,
		revealEndTime: bigint,
		quorum: bigint,
		choices: string[],
		ballotContract: string,
		tallyContract: string
	) {
		const electionId = this.electionCounter + 1n;
		if (
			!this.validatePrincipal(ballotContract) ||
			!this.validatePrincipal(tallyContract)
		) {
			return { error: 107 };
		}
		if (
			!this.validateElectionParams(
				title,
				description,
				startTime,
				commitEndTime,
				revealEndTime,
				quorum,
				choices
			)
		) {
			return { error: 101 };
		}
		if (this.elections.has(electionId.toString())) return { error: 102 };
		this.elections.set(electionId.toString(), {
			title,
			description,
			creator: caller,
			startTime,
			commitEndTime,
			revealEndTime,
			quorum,
			choices,
			ballotContract,
			tallyContract,
			isActive: true,
		});
		this.creatorElections.set(`${caller}-${electionId}`, { exists: true });
		this.electionCounter = electionId;
		return { value: electionId };
	},
	setElectionStatus(caller: string, electionId: bigint, isActive: boolean) {
		const election = this.elections.get(electionId.toString());
		if (!election) return { error: 105 };
		if (!this.isAdmin(caller) && caller !== election.creator)
			return { error: 100 };
		this.elections.set(electionId.toString(), { ...election, isActive });
		return { value: true };
	},
	getElection(electionId: bigint) {
		const election = this.elections.get(electionId.toString());
		if (!election) return { error: 105 };
		return { value: election };
	},
};

describe("BallotFactory Contract", () => {
	beforeEach(() => {
		mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
		mockContract.contractOwner = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
		mockContract.electionCounter = 0n;
		mockContract.elections = new Map();
		mockContract.creatorElections = new Map();
	});

	it("should allow admin to transfer admin rights", () => {
		const result = mockContract.transferAdmin(
			mockContract.admin,
			"ST2CY5V39QN1H4K2V3W5J8N29N3W9N3W9N3W9N3W"
		);
		expect(result).toEqual({ value: true });
		expect(mockContract.admin).toBe("ST2CY5V39QN1H4K2V3W5J8N29N3W9N3W9N3W9N3W");
	});

	it("should prevent non-admin from transferring admin rights", () => {
		const result = mockContract.transferAdmin("ST2CY5...", "ST3NB...");
		expect(result).toEqual({ error: 106 });
	});

	it("should create a new election with valid parameters", () => {
		const result = mockContract.createElection(
			"ST2CY5...",
			"Election Title",
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		expect(result).toEqual({ value: 1n });
		const election = mockContract.elections.get("1");
		expect(election).toMatchObject({
			title: "Election Title",
			description: "Election Description",
			creator: "ST2CY5...",
			isActive: true,
		});
	});

	it("should prevent election creation with invalid parameters", () => {
		const result = mockContract.createElection(
			"ST2CY5...",
			"", // Invalid title
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		expect(result).toEqual({ error: 101 });
	});

	it("should prevent duplicate election IDs", () => {
		mockContract.createElection(
			"ST2CY5...",
			"Election Title",
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		const result = mockContract.createElection(
			"ST2CY5...",
			"Election Title 2",
			"Election Description 2",
			200n,
			300n,
			400n,
			50n,
			["Choice A", "Choice B"],
			"ST3NB...",
			"ST4PF..."
		);
		expect(result).toEqual({ value: 2n });
	});

	it("should allow creator or admin to update election status", () => {
		mockContract.createElection(
			"ST2CY5...",
			"Election Title",
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		const result = mockContract.setElectionStatus("ST2CY5...", 1n, false);
		expect(result).toEqual({ value: true });
		const election = mockContract.elections.get("1");
		expect(election?.isActive).toBe(false);
	});

	it("should prevent non-creator/non-admin from updating election status", () => {
		mockContract.createElection(
			"ST2CY5...",
			"Election Title",
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		const result = mockContract.setElectionStatus("ST3NB...", 1n, false);
		expect(result).toEqual({ error: 100 });
	});

	it("should retrieve election details", () => {
		mockContract.createElection(
			"ST2CY5...",
			"Election Title",
			"Election Description",
			200n,
			300n,
			400n,
			50n,
			["Choice 1", "Choice 2"],
			"ST3NB...",
			"ST4PF..."
		);
		const result = mockContract.getElection(1n);
		expect(result).toMatchObject({
			value: {
				title: "Election Title",
				description: "Election Description",
				creator: "ST2CY5...",
				startTime: 200n,
				commitEndTime: 300n,
				revealEndTime: 400n,
				quorum: 50n,
				choices: ["Choice 1", "Choice 2"],
				ballotContract: "ST3NB...",
				tallyContract: "ST4PF...",
				isActive: true,
			},
		});
	});

	it("should return error for non-existent election", () => {
		const result = mockContract.getElection(1n);
		expect(result).toEqual({ error: 105 });
	});
});