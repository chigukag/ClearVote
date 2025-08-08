 
;; BallotFactory.clar
;; Clarity v2
;; Creates and tracks elections, stores metadata, initializes ballot parameters
;; Part of ClearVote: a secure, transparent voting platform

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PARAMS u101)
(define-constant ERR-ELECTION-EXISTS u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-INVALID-CHOICES u104)
(define-constant ERR-NO-ELECTION u105)
(define-constant ERR-NOT-ADMIN u106)
(define-constant ERR-ZERO-ADDRESS u107)
(define-constant ERR-INVALID-QUORUM u108)
(define-constant MAX-CHOICES u10) ;; Max 10 choices per election
(define-constant MIN-CHOICE-LENGTH u1)
(define-constant MAX-CHOICE-LENGTH u100)
(define-constant MIN-TITLE-LENGTH u1)
(define-constant MAX-TITLE-LENGTH u200)
(define-constant MIN-DESCRIPTION-LENGTH u0)
(define-constant MAX-DESCRIPTION-LENGTH u1000)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var contract-owner principal tx-sender)
(define-data-var election-counter uint u0)

;; Election metadata structure
(define-map elections
  { election-id: uint }
  {
    title: (string-ascii 200),
    description: (string-ascii 1000),
    creator: principal,
    start-time: uint,
    commit-end-time: uint,
    reveal-end-time: uint,
    quorum: uint, ;; Percentage (0-100)
    choices: (list 10 (string-ascii 100)),
    ballot-contract: principal,
    tally-contract: principal,
    is-active: bool
  }
)

;; Map to track election IDs by creator
(define-map creator-elections
  { creator: principal, election-id: uint }
  { exists: bool }
)

;; Private helper: validate principal
(define-private (validate-principal (address principal))
  (not (is-eq address 'SP000000000000000000002Q6VF78))
)

;; Private helper: validate election parameters
(define-private (validate-election-params
  (title (string-ascii 200))
  (description (string-ascii 1000))
  (start-time uint)
  (commit-end-time uint)
  (reveal-end-time uint)
  (quorum uint)
  (choices (list 10 (string-ascii 100))))
  (and
    (>= (len title) MIN-TITLE-LENGTH)
    (<= (len title) MAX-TITLE-LENGTH)
    (<= (len description) MAX-DESCRIPTION-LENGTH)
    (> start-time (block-height))
    (> commit-end-time start-time)
    (> reveal-end-time commit-end-time)
    (<= quorum u100)
    (>= (len choices) u2)
    (<= (len choices) MAX-CHOICES)
    (fold check-choice-length choices true)
  )
)

;; Private helper: validate choice length
(define-private (check-choice-length (choice (string-ascii 100)) (acc bool))
  (and acc
       (>= (len choice) MIN-CHOICE-LENGTH)
       (<= (len choice) MAX-CHOICE-LENGTH))
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-ADMIN))
    (asserts! (validate-principal new-admin) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Create a new election
(define-public (create-election
  (title (string-ascii 200))
  (description (string-ascii 1000))
  (start-time uint)
  (commit-end-time uint)
  (reveal-end-time uint)
  (quorum uint)
  (choices (list 10 (string-ascii 100)))
  (ballot-contract principal)
  (tally-contract principal))
  (let
    (
      (election-id (+ (var-get election-counter) u1))
      (creator tx-sender)
    )
    (asserts! (validate-principal ballot-contract) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-principal tally-contract) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-election-params title description start-time commit-end-time reveal-end-time quorum choices) (err ERR-INVALID-PARAMS))
    (asserts! (is-none (map-get? elections { election-id: election-id })) (err ERR-ELECTION-EXISTS))
    (map-set elections
      { election-id: election-id }
      {
        title: title,
        description: description,
        creator: creator,
        start-time: start-time,
        commit-end-time: commit-end-time,
        reveal-end-time: reveal-end-time,
        quorum: quorum,
        choices: choices,
        ballot-contract: ballot-contract,
        tally-contract: tally-contract,
        is-active: true
      }
    )
    (map-set creator-elections
      { creator: creator, election-id: election-id }
      { exists: true }
    )
    (var-set election-counter election-id)
    (ok election-id)
  )
)

;; Update election status
(define-public (set-election-status (election-id uint) (is-active bool))
  (let
    (
      (election (unwrap! (map-get? elections { election-id: election-id }) (err ERR-NO-ELECTION)))
      (creator (get creator election))
    )
    (asserts! (or (is-admin) (is-eq tx-sender creator)) (err ERR-NOT-AUTHORIZED))
    (map-set elections
      { election-id: election-id }
      (merge election { is-active: is-active })
    )
    (ok true)
  )
)

;; Read-only: get election details
(define-read-only (get-election (election-id uint))
  (match (map-get? elections { election-id: election-id })
    election (ok election)
    (err ERR-NO-ELECTION)
  )
)

;; Read-only: get election count
(define-read-only (get-election-count)
  (ok (var-get election-counter))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if election exists for creator
(define-read-only (has-election (creator principal) (election-id uint))
  (ok (default-to false (get exists (map-get? creator-elections { creator: creator, election-id: election-id }))))
)

;; Read-only: get election metadata
(define-read-only (get-election-metadata (election-id uint))
  (match (map-get? elections { election-id: election-id })
    election (ok {
      title: (get title election),
      description: (get description election),
      creator: (get creator election),
      start-time: (get start-time election),
      commit-end-time: (get commit-end-time election),
      reveal-end-time: (get reveal-end-time election),
      quorum: (get quorum election),
      choices: (get choices election)
    })
    (err ERR-NO-ELECTION)
  )
)