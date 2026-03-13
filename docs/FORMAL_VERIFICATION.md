# SSS Formal Verification Specification

## SECTION 1 — SYSTEM MODEL

### 1.1 State Definition
- **$\Sigma_{global}$**: Global protocol state (Paused, Versioning).
- **$\Sigma_{config}$**: Modular policy configuration (SSS-1 vs SSS-2 flags).
- **$\Sigma_{auth}$**: Role-based access control mapping $RBAC: Role \times Pubkey \to \{Authorized, Unauthorized\}$.
- **$\Sigma_{supply}$**: Total supply $S = \sum b_i$.
- **$\Sigma_{blacklist}$**: Compliance set $B \subset \{Pubkeys\}$.
- **$\Sigma_{quota}$**: Quota mapping $Q: Minter \to \mathbb{N}_{\ge 0}$.

### 1.2 Invariant Classes
1. **Global Invariants ($I_G$)**: Properties that hold across all transactions.
2. **Account-Local Invariants ($I_L$)**: Safety constraints on individual token accounts.
3. **Transition Invariants ($I_T$)**: Constraints on allowed state updates (Pre-conditions $\to$ Post-conditions).
4. **Compositional Invariants ($I_C$)**: Constraints on interacting modules (e.g., Hook $\cap$ Freeze).

---

## SECTION 2 — SAFETY PROPERTIES

| Property | Formal Statement | Violation Consequence |
| :--- | :--- | :--- |
| **Supply Conservation** | $S_{after} = S_{before} + Minted - Burned$ | Arbitrary value creation. |
| **Authorized Mint** | $Success(Mint(A)) \implies Caller \in Minters \land Q(Caller) \ge A$ | Inflation attack. |
| **Authorized Seizure** | $Success(Seize(T)) \implies T \in B \land Caller \in Seizers$ | State theft. |
| **Blacklist Enclosure** | $Success(Transfer(S, D)) \implies S \notin B \land D \notin B$ | Sanctions evasion. |
| **Quota Monotonicity** | $Q_{after} = Q_{before} - A$ | Quota bypass. |
| **RBAC Continuity** | $RoleRemoval(K) \implies Next(Success(PrivilegedOp(K))) = \text{Fail}$ | Stale privilege exploit. |

---

## SECTION 3 — STATE TRANSITION PROPERTIES

### 3.1 Allowed Transitions
- **`ACTIVE` $\leftrightarrow$ `PAUSED`**: Via `pause()` instruction by `Pauser`.
- **`NORMAL` $\to$ `FROZEN`**: Via `freeze_account()` by `Pauser`.
- **`NORMAL` $\to$ `BLACKLISTED`**: Via `add_to_blacklist()` by `Blacklister`.

### 3.2 Forbidden Transitions
- `PAUSED` $\xrightarrow{mint}$ Success: **INVALID**.
- `BLACKLISTED` $\xrightarrow{transfer}$ Success: **INVALID**.
- `Role(None)` $\xrightarrow{privileged\_op}$ Success: **INVALID**.

---

## SECTION 4 — AUTHORITY & ACCESS CONTROL

### 4.1 Least Privilege
- **Seizer** cannot `Mint`.
- **Minter** cannot `Blacklist`.
- **Pauser** cannot `UpdateQuota`.

### 4.2 Non-Interference
- A compromise of the `Blacklister` key must not permit the attacker to rotate the `Master Authority`.

---

## SECTION 5 — COMPLIANCE & SEIZURE PROPERTIES
- **P-C1**: $Seize(From, To, Amt) \vdash b_{From} \ge Amt \land From \in B$.
- **P-C2**: $TransferHook \cap Blacklist \vdash AtomicConstraint$. No transfer can be "partially" blacklisted.

---

## SECTION 6 — QUOTA & MINT CONTROL
- **P-Q1**: $Mint(Amt) \implies Limit_{new} = Limit_{old} - Amt$.
- **P-Q2**: $UpdateQuota(Limit) \implies Limit_{new} = Limit$.

---

## SECTION 7 — CROSS-MODULE COMPOSITION
- **P-X1**: Enabling `PermanentDelegate` does not bypass `TransferHook` checks.
- **P-X2**: `Freeze` authority and `Blacklist` authority are logically distinct but both stop `Transfer`.

---

## SECTION 8 — LIVENESS PROPERTIES
- **L-1**: $(\text{Protocol Active} \land \text{Valid Signature} \land \text{Sufficient Funds}) \implies \text{Eventually Success}$.

---

## SECTION 9 — FORMALIZED INVARIANTS (TLA+ Style)

- **Inv_Core_Supply**: $Supply = \sum_{a \in Accounts} balance(a)$
- **Inv_Compliance_Enforcement**: $\forall a \in B: balance(a) \text{ is immutable except via } Seize()$.
- **Inv_Authority_Hierarchy**: $\forall r \in Roles: \text{Owner}(r) \in \text{Signers} \land \text{CanModify}(Master, r)$.

---

## SECTION 10 — PROPERTY-BASED TEST MAPPING (Hedgehog/Trident)

| Property | Strategy | Tool |
| :--- | :--- | :--- |
| Supply Conservation | Stateful Fuzzing | Trident |
| Quota Exhaustion | Boundary Testing | Anchor Test |
| Sanctions Evasion | Randomized Compliance | Trident |
| Role Escalation | Negative Permutation | Anchor Test |

---

## SECTION 11 — HIGHEST-RISK PROPERTIES
1. **Unchecked Seizure**: Missing blacklist check (V4 Patched).
2. **Transfer Hook Latency**: Risk of transfers passing before registry update.
3. **Authority Confusion**: PDA seeds overlapping between different registries.

---

## SECTION 12 — FINAL VERIFICATION PACKAGE
- **Priority**: Verify **Inv_Core_Supply** and **Inv_Compliance_Enforcement** first.
- **Next**: Formally model the `TransferHook` interaction with TLA+.
