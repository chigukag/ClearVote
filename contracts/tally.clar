 
;; Tally.clar
;; Clarity v2
;; Handles vote tallying and election finalization for ClearVote
;; Integrates with Ballot.clar for vote counts and BallotFactory.clar for parameters

(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-ELECTION u301)
(define-constant ERR-ELECTION-NOT-ENDED u302)
(define-constant ERR-QUORUM-NOT-MET u303)
(define-constant ERR-ALREADY-FINALIZED u304)
(define-constant ERR-ZERO-ADDRESS u305)
(define-constant ERR-INVALID-BALLOT-CONTRACT u306)
(define-constant ERR-NO-VOTES u307)
(define-constant ERR-INVALID-CHOICE u308)

;; Election state
(define-data-var election-id uint u0)
(define-data-var factory-contract principal tx-sender)
(define-data-var ballot-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reveal-end-time uint u0)
(define-data-var quorum uint u0)
(define-data-var total-voters uint u0)
(define-data-var is-finalized bool false)
(define-data-var is-active bool false)

;; Results storage
(define-map vote-tallies { choice: (string-ascii 100) } { count: uint })
(define-map election-results { election-id: uint } { winners: (list 10 (string-ascii 100)), total-votes: uint })

;; Private helper: validate principal
(define-private (validate-principal (address principal))
  (not (is-eq address 'SP000000000000000000002Q6VF78))
)

;; Private helper: check if caller is factory
(define-private (is-factory)
  (is-eq tx-sender (var-get factory-contract))
)

;; Private helper: check if election has ended
(define-private (has-election-ended)
  (>= (block-height) (var-get reveal-end-time))
)

;; Private helper: check if quorum is met
(define-private (is-quorum-met (total-votes uint))
  (if (is-eq (var-get total-voters) u0)
    false
    (>= (* total-votes u100) (* (var-get quorum) (var-get total-voters)))
  )
)

;; Initialize tally contract
(define-public (initialize
  (id uint)
  (ballot principal)
  (reveal-end uint)
  (election-quorum uint)
  (voters uint)
  (choices (list 10 (string-ascii 100))))
  (begin
    (asserts! (is-factory) (err ERR-NOT-AUTHORIZED))
    (asserts! (> id u0) (err ERR-INVALID-ELECTION))
    (asserts! (validate-principal ballot) (err ERR-ZERO-ADDRESS))
    (asserts! (> reveal-end (block-height)) (err ERR-ELECTION-NOT-ENDED))
    (asserts! (<= election-quorum u100) (err ERR-INVALID-CHOICE))
    (asserts! (>= (len choices) u2) (err ERR-INVALID-CHOICE))
    (var-set election-id id)
    (var-set ballot-contract ballot)
    (var-set reveal-end-time reveal-end)
    (var-set quorum election-quorum)
    (var-set total-voters voters)
    (var-set is-active true)
    ;; Initialize vote tallies for each choice
    (map initialize-tally choices)
    (ok true)
  )
)

;; Private helper: initialize tally for a choice
(define-private (initialize-tally (choice (string-ascii 100)))
  (begin
    (map-set vote-tallies { choice: choice } { count: u0 })
    choice
  )
)

;; Finalize election results
(define-public (finalize-election)
  (let
    (
      (total-votes (unwrap! (compute-total-votes) (err ERR-NO-VOTES)))
      (choices (unwrap! (contract-call? (var-get ballot-contract) get-election-details) (err ERR-INVALID-BALLOT-CONTRACT)))
      (choice-list (get choices choices))
      (vote-counts (map get-vote-count choice-list))
      (max-votes (fold find-max-votes vote-counts u0))
      (winners (filter is-winner choice-list))
    )
    (asserts! (is-factory) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get is-active) (err ERR-INVALID-ELECTION))
    (asserts! (has-election-ended) (err ERR-ELECTION-NOT-ENDED))
    (asserts! (not (var-get is-finalized)) (err ERR-ALREADY-FINALIZED))
    (asserts! (is-quorum-met total-votes) (err ERR-QUORUM-NOT-MET))
    (asserts! (> (len winners) u0) (err ERR-NO-VOTES))
    (map-set election-results
      { election-id: (var-get election-id) }
      { winners: winners, total-votes: total-votes }
    )
    (var-set is-finalized true)
    (var-set is-active false)
    (ok winners)
  )
)

;; Private helper: compute total votes
(define-private (compute-total-votes)
  (let
    (
      (choices (unwrap! (get choices (contract-call? (var-get ballot-contract) get-election-details)) (err ERR-INVALID-BALLOT-CONTRACT)))
      (counts (map get-vote-count choices))
    )
    (ok (fold + counts u0))
  )
)

;; Private helper: get vote count from ballot contract
(define-private (get-vote-count (choice (string-ascii 100)))
  (let
    (
      (count-result (contract-call? (var-get ballot-contract) get-vote-count choice))
    )
    (unwrap! count-result (err ERR-INVALID-BALLOT-CONTRACT))
  )
)

;; Private helper: find maximum votes
(define-private (find-max-votes (count uint) (current-max uint))
  (if (> count current-max) count current-max)
)

;; Private helper: filter winners
(define-private (is-winner (choice (string-ascii 100)))
  (let
    (
      (count (unwrap! (contract-call? (var-get ballot-contract) get-vote-count choice) (err ERR-INVALID-BALLOT-CONTRACT)))
      (max-votes (fold find-max-votes (map get-vote-count (unwrap! (get choices (contract-call? (var-get ballot-contract) get-election-details)) (err ERR-INVALID-BALLOT-CONTRACT))) u0))
    )
    (if (is-eq count max-votes) choice false)
  )
)

;; Read-only: get election results
(define-read-only (get-election-results (id uint))
  (match (map-get? election-results { election-id: id })
    result (ok result)
    (err ERR-INVALID-ELECTION)
  )
)

;; Read-only: get vote tally for a choice
(define-read-only (get-vote-tally (choice (string-ascii 100)))
  (match (map-get? vote-tallies { choice: choice })
    tally (ok (get count tally))
    (err ERR-INVALID-CHOICE)
  )
)

;; Read-only: get election details
(define-read-only (get-election-details)
  (ok {
    election-id: (var-get election-id),
    ballot-contract: (var-get ballot-contract),
    reveal-end-time: (var-get reveal-end-time),
    quorum: (var-get quorum),
    total-voters: (var-get total-voters),
    is-finalized: (var-get is-finalized),
    is-active: (var-get is-active)
  })
)

;; Read-only: check if election is finalized
(define-read-only (is-election-finalized)
  (ok (var-get is-finalized))
)

;; Read-only: get factory contract
(define-read-only (get-factory)
  (ok (var-get factory-contract))
)