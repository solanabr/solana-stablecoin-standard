//! Instruction handlers for SSS Stablecoin

pub mod blacklist;
pub mod burn;
pub mod finalize_creation;
pub mod freeze_thaw;
pub mod initialize;
pub mod initialize_existing_mint;
pub mod mint;
pub mod pause;
pub mod seize;
pub mod transfer_authority;
pub mod update_minter;
pub mod update_roles;

// Re-export common context types that might be needed elsewhere
pub use blacklist::{AddToBlacklist, RemoveFromBlacklist};
pub use burn::Burn;
pub use finalize_creation::FinalizeCreation;
pub use freeze_thaw::{FreezeAccount, ThawAccount};
pub use initialize::{Initialize, InitializeArgs, RoleConfiguration};
pub use initialize_existing_mint::InitializeExistingMint;
pub use mint::Mint;
pub use pause::{Pause, Unpause};
pub use seize::{Seize, SeizeArgs};
pub use transfer_authority::TransferAuthority;
pub use update_minter::{UpdateMinter, UpdateMinterArgs};
pub use update_roles::{UpdateRoles, UpdateRolesArgs};
