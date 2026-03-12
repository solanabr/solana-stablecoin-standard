pub mod initialize;
pub mod mint;
pub mod burn;
pub mod freeze;
pub mod thaw;
pub mod pause;
pub mod roles;
pub mod blacklist;
pub mod seize;

// Anchor's #[program] macro generates __client_accounts_* types
// via #[derive(Accounts)], and expects them accessible via glob
// re-exports from the instructions module. Without glob re-exports,
// you get E0432 "unresolved import" errors at compile time.
//
// The `handler` name ambiguity warning is harmless — Anchor
// calls handlers via the explicit paths in lib.rs anyway.
pub use initialize::*;
pub use mint::*;
pub use burn::*;
pub use freeze::*;
pub use thaw::*;
pub use pause::*;
pub use roles::*;
pub use blacklist::*;
pub use seize::*;
