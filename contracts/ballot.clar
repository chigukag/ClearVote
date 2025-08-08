;; Ballot.clar
;; Clarity v2
;; Handles commit-reveal voting logic for a single election in ClearVote
;; Manages voter commitments and reveals, ensuring privacy and verifiability

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-ELECTION u201)
(define-constant ERR-INVALID-COMMIT-PERIOD u202)
(define-constant ERR-INVALID-REVEAL-PERIOD u203)
(define-constant ERR-INVALID-COMMIT u204)
(define-constant ERR-ALREADY-VOTED u205)
(define-constant ERR-INVALID-CHOICE u206)
(define-constant ERR-INVALID-HASH u207)
(define-constant ERR-ELECTION-INACTIVE u208)
(define-constant ERR-ZERO-ADDRESS u209)
(define-constant ERR-INVALID-NONCE u210)
(define-constant ERR-INVALID-ELECTION-ID u211)

;; Election parameters
(define-data-var election-id uint u0)
(define-data-var factory-contract principal tx-sender)
(define-data-var start-time uint u0)
(define-data-var commit-end-time uint u0)
(define-data-var reveal-end-time uint u0)
(define-data-var choices (list 10 (string-ascii 100)) (list))
(define-data-var is-active bool false)

;; Vote storage
(define-map commitments { voter: principal } { hash: (buff 32), timestamp: uint })
(define-map reveals { voter: principal } { choice: (string-ascii 100), nonce: (buff 32) })
(define-map vote-counts { choice: (string-ascii 100) } { count: uint })

;; Private helper: validate principal
(define-private (validate-principal (address principal))
  (not (is-eq address 'SP000000000000000000002Q6VF78))
)

;; Private helper: check if caller is factory
(define-private (is-factory)
  (is-eq tx-sender (var-get factory-contract))
)

;; Private helper: check if election is active
(define-private (is-election-active)
  (var-get is-active)
)

;; Private helper: check if within commit period
(define-private (is-commit-period)
  (and
    (>= (block-height) (var-get start-time))
    (< (block-height) (var-get commit-end-time))
  )
)

;; Private helper: check if within reveal period
(define-private (is-reveal-period)
  (and
    (>= (block-height) (var-get commit-end-time))
    (< (block-height) (var-get reveal-end-time))
  )
)

;; Private helper: validate choice
(define-private (is-valid-choice (choice (string-ascii 100)))
  (is-some (index-of (var-get choices) choice))
)

;; Initialize election parameters
(define-public (initialize
  (id uint)
  (start uint)
  (commit-end uint)
  (reveal-end uint)
  (election-choices (list 10 (string-ascii 100))))
  (begin
    (asserts! (is-factory) (err ERR-NOT-AUTHORIZED))
    (asserts! (> id u0) (err ERR-INVALID-ELECTION-ID))
    (asserts! (is-none (map-get? commitments { voter: tx-sender })) (err ERR-INVALID-ELECTION))
    (asserts! (> start (block-height)) (err ERR-INVALID-COMMIT-PERIOD))
    (asserts! (> commit-end start) (err ERR-INVALID-COMMIT-PERIOD))
    (asserts! (> reveal-end commit-end) (err ERR-INVALID-REVEAL-PERIOD))
    (asserts! (>= (len election-choices) u2) (err ERR-INVALID-CHOICE))
    (var-set election-id id)
    (var-set start-time start)
    (var-set commit-end-time commit-end)
    (var-set reveal-end-time reveal-end)
    (var-set choices election-choices)
    (var-set is-active true)
    (ok true)
  )
)

;; Commit a vote (hashed vote)
(define-public (commit-vote (hash (buff 32)))
  (begin
    (asserts! (is-election-active) (err ERR-ELECTION-INACTIVE))
    (asserts! (is-commit-period) (err ERR-INVALID-COMMIT-PERIOD))
    (asserts! (is-none (map-get? commitments { voter: tx-sender })) (err ERR-ALREADY-VOTED))
    (asserts! (> (len hash) u0) (err ERR-INVALID-COMMIT))
    (map-set commitments
      { voter: tx-sender }
      { hash: hash, timestamp: (block-height) }
    )
    (ok true)
  )
)

;; Reveal a vote
(define-public (reveal-vote (choice (string-ascii 100)) (nonce (buff 32)))
  (begin
    (asserts! (is-election-active) (err ERR-ELECTION-INACTIVE))
    (asserts! (is-reveal-period) (err ERR-INVALID-REVEAL-PERIOD))
    (asserts! (is-valid-choice choice) (err ERR-INVALID-CHOICE))
    (asserts! (> (len nonce) u0) (err ERR-INVALID-NONCE))
    (let
      (
        (commitment (unwrap! (map-get? commitments { voter: tx-sender }) (err ERR-INVALID-COMMIT)))
        (expected-hash (sha256 (concat (unwrap! (to-bytes choice) (err ERR-INVALID-CHOICE)) nonce)))
      )
      (asserts! (is-eq (get hash commitment) expected-hash) (err ERR-INVALID-HASH))
      (map-set reveals
        { voter: tx-sender }
        { choice: choice, nonce: nonce }
      )
      (map-set vote-counts
        { choice: choice }
        { count: (+ u1 (default-to u0 (get count (map-get? vote-counts { choice: choice })))) }
      )
      (ok true)
    )
  )
)

;; Set election status
(define-public (set-election-status (status bool))
  (begin
    (asserts! (is-factory) (err ERR-NOT-AUTHORIZED))
    (var-set is-active status)
    (ok true)
  )
)

;; Read-only: get election details
(define-read-only (get-election-details)
  (ok {
    election-id: (var-get election-id),
    start-time: (var-get start-time),
    commit-end-time: (var-get commit-end-time),
    reveal-end-time: (var-get reveal-end-time),
    choices: (var-get choices),
    is-active: (var-get is-active)
  })
)

;; Read-only: get commitment
(define-read-only (get-commitment (voter principal))
  (match (map-get? commitments { voter: voter })
    commitment (ok commitment)
    (err ERR-INVALID-COMMIT)
  )
)

;; Read-only: get reveal
(define-read-only (get-reveal (voter principal))
  (match (map-get? reveals { voter: voter })
    reveal (ok reveal)
    (err ERR-INVALID-COMMIT)
  )
)

;; Read-only: get vote count for a choice
(define-read-only (get-vote-count (choice (string-ascii 100)))
  (ok (default-to u0 (get count (map-get? vote-counts { choice: choice }))))
)

;; Read-only: get factory contract
(define-read-only (get-factory)
  (ok (var-get factory-contract))
)

;; Read-only: check if voter has committed
(define-read-only (has-committed (voter principal))
  (ok (is-some (map-get? commitments { voter: voter })))
)

;; Read-only: check if voter has revealed
(define-read-only (has-revealed (voter principal))
  (ok (is-some (map-get? reveals { voter: voter })))
)