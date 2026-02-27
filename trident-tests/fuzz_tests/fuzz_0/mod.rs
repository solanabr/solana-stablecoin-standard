/// SSS Token Program - Fuzz Test Module
///
/// This module contains property-based fuzz tests targeting the validation
/// logic and state invariants of the sss-token Anchor program. The tests
/// exercise boundary conditions, overflow protection, access control, and
/// input validation without requiring a live Solana runtime.
///
/// Test categories:
///   - Input validation (name, symbol, URI, decimals, reason lengths)
///   - Arithmetic safety (overflow on total_minted, total_burned, quotas)
///   - Minter quota enforcement (can_mint, remaining_quota)
///   - Role-based access control (RoleRegistry.has_role)
///   - State invariants (current_supply, paused checks)

pub mod test_fuzz;
