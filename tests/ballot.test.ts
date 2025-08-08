import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------
// Types
// ---------------------------
type Principal = string;
type Buff32 = Uint8Array; // 32 bytes
type Choice = string;

interface Commitment {
	hash: Buff32;
	timestamp: number;
}

interface Reveal {
	choice: Choice;
	nonce: Buff32;
}

interface VoteCount {
	count: number;
}

interface ElectionDetails {
	electionId: number;
	startTime: number;
	commitEndTime: number;
	revealEndTime: number;
	choices: Choice[];
	isActive: boolean;
}

// ---------------------------
// Mock Blockchain State
// ---------------------------
let commitments: Record<Principal, Commitment>;
let reveals: Record<Principal, Reveal>;
let voteCounts: Record<Choice, VoteCount>;
let election: ElectionDetails;
let factoryContract: Principal;
let blockHeight: number;

// ---------------------------
// Helper Functions
// ---------------------------
function sha256(data: Uint8Array): Buff32 {
	const crypto = require("crypto");
	return new Uint8Array(crypto.createHash("sha256").update(data).digest());
}

function concatBuffers(a: Uint8Array, b: Uint8Array): Uint8Array {
	const merged = new Uint8Array(a.length + b.length);
	merged.set(a);
	merged.set(b, a.length);
	return merged;
}

function toBytes(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

// ---------------------------
// Mock Contract Functions
// ---------------------------
function initializeElection(
	id: number,
	start: number,
	commitEnd: number,
	revealEnd: number,
	choices: Choice[],
	sender: Principal
) {
	if (sender !== factoryContract) throw new Error("ERR-NOT-AUTHORIZED");
	if (id <= 0) throw new Error("ERR-INVALID-ELECTION-ID");
	if (start <= blockHeight) throw new Error("ERR-INVALID-COMMIT-PERIOD");
	if (commitEnd <= start) throw new Error("ERR-INVALID-COMMIT-PERIOD");
	if (revealEnd <= commitEnd) throw new Error("ERR-INVALID-REVEAL-PERIOD");
	if (choices.length < 2) throw new Error("ERR-INVALID-CHOICE");

	election = {
		electionId: id,
		startTime: start,
		commitEndTime: commitEnd,
		revealEndTime: revealEnd,
		choices,
		isActive: true,
	};
}

function commitVote(hash: Buff32, sender: Principal) {
	if (!election.isActive) throw new Error("ERR-ELECTION-INACTIVE");
	if (blockHeight < election.startTime || blockHeight >= election.commitEndTime)
		throw new Error("ERR-INVALID-COMMIT-PERIOD");
	if (commitments[sender]) throw new Error("ERR-ALREADY-VOTED");
	if (!hash || hash.length === 0) throw new Error("ERR-INVALID-COMMIT");

	commitments[sender] = { hash, timestamp: blockHeight };
}

function revealVote(choice: Choice, nonce: Buff32, sender: Principal) {
	if (!election.isActive) throw new Error("ERR-ELECTION-INACTIVE");
	if (
		blockHeight < election.commitEndTime ||
		blockHeight >= election.revealEndTime
	)
		throw new Error("ERR-INVALID-REVEAL-PERIOD");
	if (!election.choices.includes(choice)) throw new Error("ERR-INVALID-CHOICE");
	if (!nonce || nonce.length === 0) throw new Error("ERR-INVALID-NONCE");

	const commitment = commitments[sender];
	if (!commitment) throw new Error("ERR-INVALID-COMMIT");

	const expectedHash = sha256(concatBuffers(toBytes(choice), nonce));
	if (
		Buffer.compare(Buffer.from(commitment.hash), Buffer.from(expectedHash)) !==
		0
	)
		throw new Error("ERR-INVALID-HASH");

	reveals[sender] = { choice, nonce };
	voteCounts[choice] = {
		count: (voteCounts[choice]?.count ?? 0) + 1,
	};
}

// ---------------------------
// Tests
// ---------------------------
describe("Ballot Contract", () => {
	const voterA: Principal = "SP123";
	const voterB: Principal = "SP456";
	const nonceA = crypto.getRandomValues(new Uint8Array(32));
	const choiceA = "Alice";

	beforeEach(() => {
		commitments = {};
		reveals = {};
		voteCounts = {};
		factoryContract = "SPFACTORY";
		blockHeight = 100;

		// Pre-initialize election in some tests
		election = {
			electionId: 0,
			startTime: 0,
			commitEndTime: 0,
			revealEndTime: 0,
			choices: [],
			isActive: false,
		};
	});

	it("should initialize election", () => {
		initializeElection(1, 110, 120, 130, ["Alice", "Bob"], factoryContract);
		expect(election.isActive).toBe(true);
		expect(election.choices).toContain("Alice");
	});

	it("should reject initialization by non-factory", () => {
		expect(() =>
			initializeElection(1, 110, 120, 130, ["Alice", "Bob"], voterA)
		).toThrow("ERR-NOT-AUTHORIZED");
	});

	it("should commit a vote", () => {
		initializeElection(1, 110, 120, 130, ["Alice", "Bob"], factoryContract);
		blockHeight = 111;
		const hash = sha256(concatBuffers(toBytes(choiceA), nonceA));
		commitVote(hash, voterA);
		expect(commitments[voterA]).toBeDefined();
	});

	it("should reveal a vote", () => {
		initializeElection(1, 110, 120, 130, ["Alice", "Bob"], factoryContract);

		// Commit phase
		blockHeight = 111;
		const hash = sha256(concatBuffers(toBytes(choiceA), nonceA));
		commitVote(hash, voterA);

		// Reveal phase
		blockHeight = 121;
		revealVote(choiceA, nonceA, voterA);
		expect(reveals[voterA].choice).toBe("Alice");
		expect(voteCounts["Alice"].count).toBe(1);
	});

	it("should reject reveal with wrong hash", () => {
		initializeElection(1, 110, 120, 130, ["Alice", "Bob"], factoryContract);
		blockHeight = 111;
		const hash = sha256(concatBuffers(toBytes(choiceA), nonceA));
		commitVote(hash, voterA);

		blockHeight = 121;
		const wrongNonce = crypto.getRandomValues(new Uint8Array(32));
		expect(() => revealVote(choiceA, wrongNonce, voterA)).toThrow(
			"ERR-INVALID-HASH"
		);
	});
});
