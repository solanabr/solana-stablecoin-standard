use sss_admin_cli::chain::{MinterRecord, RoleRecord};

pub struct GovernanceViewModel {
    pub mint: String,
    pub roles: RoleViewModel,
    pub minters: Vec<MinterViewModel>,
}

pub struct RoleViewModel {
    pub master_authority: String,
    pub pauser: String,
    pub burner: String,
    pub blacklister: String,
    pub seizer: String,
}

pub struct MinterViewModel {
    pub minter: String,
    pub quota: String,
    pub minted: String,
    pub active: String,
}

impl GovernanceViewModel {
    pub fn from_chain(mint: &str, roles: RoleRecord, minters: Vec<MinterRecord>) -> Self {
        let mut rows = minters
            .into_iter()
            .map(|record| MinterViewModel {
                minter: record.minter.to_string(),
                quota: record.quota.to_string(),
                minted: record.minted.to_string(),
                active: if record.active {
                    "yes".to_string()
                } else {
                    "no".to_string()
                },
            })
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| right.minted.cmp(&left.minted));

        Self {
            mint: mint.to_string(),
            roles: RoleViewModel {
                master_authority: roles.master_authority.to_string(),
                pauser: roles.pauser.to_string(),
                burner: roles.burner.to_string(),
                blacklister: roles.blacklister.to_string(),
                seizer: roles.seizer.to_string(),
            },
            minters: rows,
        }
    }
}
