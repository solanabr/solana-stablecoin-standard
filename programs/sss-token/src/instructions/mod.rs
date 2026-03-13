pub mod blacklist;
pub mod burn;
pub mod freeze;
pub mod initialize;
pub mod mint;
pub mod pause;
pub mod roles;
pub mod seize;
pub mod thaw;

// Anchor's #[program] macro generates __client_accounts_* types
// via #[derive(Accounts)], and expects them accessible via glob
// re-exports from the instructions module. Without glob re-exports,
// you get E0432 "unresolved import" errors at compile time.
//
// The `handler` name ambiguity warning is harmless — Anchor
// calls handlers via the explicit paths in lib.rs anyway.
pub use blacklist::*;
pub use burn::*;
pub use freeze::*;
pub use initialize::*;
pub use mint::*;
pub use pause::*;
pub use roles::*;
pub use seize::*;
pub use thaw::*;
