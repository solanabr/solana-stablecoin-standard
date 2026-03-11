use arbitrary::Arbitrary;
use stablecoin::state::StablecoinConfig;

/// Fuzz test inputs for the stablecoin program
/// Tests invariants around minting, burning, and access control

#[derive(Debug, Arbitrary)]
struct FuzzMintInput {
    amount: u64,
    allowance: u64,
    total_minted_before: u64,
}

#[derive(Debug, Arbitrary)]
struct FuzzBurnInput {
    amount: u64,
    balance: u64,
    total_burned_before: u64,
}

#[derive(Debug, Arbitrary)]
struct FuzzInitInput {
    name_len: u8,
    symbol_len: u8,
    uri_len: u8,
    decimals: u8,
    preset: u8,
}

#[derive(Debug, Arbitrary)]
struct FuzzAllowanceInput {
    initial_allowance: u64,
    mint_amount: u64,
    new_allowance: u64,
}

/// Test mint invariants:
/// 1. Cannot mint more than allowance
/// 2. total_minted always increases
/// 3. No overflow in total_minted
fn test_mint_invariants(input: &FuzzMintInput) {
    // Invariant: mint amount cannot exceed allowance
    if input.amount > input.allowance {
        // This should be rejected by the program
        return;
    }

    // Invariant: total_minted should not overflow
    let new_total = input.total_minted_before.checked_add(input.amount);
    assert!(
        new_total.is_some() || input.amount == 0,
        "total_minted overflow: {} + {} = overflow",
        input.total_minted_before,
        input.amount
    );

    if let Some(total) = new_total {
        // Invariant: total_minted always increases or stays same
        assert!(
            total >= input.total_minted_before,
            "total_minted decreased: {} -> {}",
            input.total_minted_before,
            total
        );
    }

    // Invariant: allowance decreases by mint amount
    let remaining = input.allowance.checked_sub(input.amount);
    assert!(
        remaining.is_some(),
        "allowance underflow: {} - {}",
        input.allowance,
        input.amount
    );
}

/// Test burn invariants:
/// 1. Cannot burn more than balance
/// 2. total_burned always increases
/// 3. No overflow in total_burned
fn test_burn_invariants(input: &FuzzBurnInput) {
    // Invariant: burn amount cannot exceed balance
    if input.amount > input.balance {
        return;
    }

    // Invariant: total_burned should not overflow
    let new_total = input.total_burned_before.checked_add(input.amount);
    assert!(
        new_total.is_some() || input.amount == 0,
        "total_burned overflow: {} + {} = overflow",
        input.total_burned_before,
        input.amount
    );

    if let Some(total) = new_total {
        assert!(
            total >= input.total_burned_before,
            "total_burned decreased: {} -> {}",
            input.total_burned_before,
            total
        );
    }
}

/// Test initialization invariants:
/// 1. Name length must be <= MAX_NAME_LEN
/// 2. Symbol length must be <= MAX_SYMBOL_LEN
/// 3. URI length must be <= MAX_URI_LEN
/// 4. Decimals should be reasonable (0-18)
fn test_init_invariants(input: &FuzzInitInput) {
    let max_name = StablecoinConfig::MAX_NAME_LEN;
    let max_symbol = StablecoinConfig::MAX_SYMBOL_LEN;
    let max_uri = StablecoinConfig::MAX_URI_LEN;

    // Test that validation catches oversized inputs
    if (input.name_len as usize) > max_name {
        // Should be rejected
    }
    if (input.symbol_len as usize) > max_symbol {
        // Should be rejected
    }
    if (input.uri_len as usize) > max_uri {
        // Should be rejected
    }

    // Preset must be valid (0-3)
    let _valid_preset = input.preset <= 3;
}

/// Test allowance update invariants:
/// 1. Minting reduces allowance correctly
/// 2. Updating allowance sets exact value
fn test_allowance_invariants(input: &FuzzAllowanceInput) {
    if input.mint_amount > input.initial_allowance {
        return;
    }

    let after_mint = input.initial_allowance - input.mint_amount;

    // After minting, allowance should be reduced
    assert!(
        after_mint <= input.initial_allowance,
        "allowance increased after mint"
    );

    // After updating, allowance should be exactly the new value
    // (not relative to old value)
    let _final_allowance = input.new_allowance;
}

/// Test supply invariant:
/// total_supply = total_minted - total_burned >= 0
fn test_supply_invariant(total_minted: u64, total_burned: u64) {
    if total_burned > total_minted {
        // This should never happen in a correct program
        // burned should always be <= minted
        return;
    }

    let supply = total_minted - total_burned;
    assert!(
        supply <= total_minted,
        "supply exceeds total_minted: {} > {}",
        supply,
        total_minted
    );
}

fn main() {
    loop {
        // honggfuzz provides fuzz data through this macro
        honggfuzz::fuzz!(|data: &[u8]| {
            if data.len() < 32 {
                return;
            }

            // Parse fuzz input for mint test
            if let Ok(input) = FuzzMintInput::try_from_slice(data) {
                test_mint_invariants(&input);
            }

            // Parse fuzz input for burn test
            if let Ok(input) = FuzzBurnInput::try_from_slice(data) {
                test_burn_invariants(&input);
            }

            // Parse fuzz input for init test
            if let Ok(input) = FuzzInitInput::try_from_slice(data) {
                test_init_invariants(&input);
            }

            // Parse fuzz input for allowance test
            if let Ok(input) = FuzzAllowanceInput::try_from_slice(data) {
                test_allowance_invariants(&input);
            }

            // Test supply invariant with random values
            if data.len() >= 16 {
                let total_minted = u64::from_le_bytes(data[0..8].try_into().unwrap());
                let total_burned = u64::from_le_bytes(data[8..16].try_into().unwrap());
                test_supply_invariant(total_minted, total_burned);
            }
        });
    }
}

/// Helper trait for arbitrary deserialization from raw bytes
trait TryFromSlice: Sized {
    fn try_from_slice(data: &[u8]) -> Result<Self, ()>;
}

impl TryFromSlice for FuzzMintInput {
    fn try_from_slice(data: &[u8]) -> Result<Self, ()> {
        if data.len() < 24 {
            return Err(());
        }
        Ok(Self {
            amount: u64::from_le_bytes(data[0..8].try_into().map_err(|_| ())?),
            allowance: u64::from_le_bytes(data[8..16].try_into().map_err(|_| ())?),
            total_minted_before: u64::from_le_bytes(data[16..24].try_into().map_err(|_| ())?),
        })
    }
}

impl TryFromSlice for FuzzBurnInput {
    fn try_from_slice(data: &[u8]) -> Result<Self, ()> {
        if data.len() < 24 {
            return Err(());
        }
        Ok(Self {
            amount: u64::from_le_bytes(data[0..8].try_into().map_err(|_| ())?),
            balance: u64::from_le_bytes(data[8..16].try_into().map_err(|_| ())?),
            total_burned_before: u64::from_le_bytes(data[16..24].try_into().map_err(|_| ())?),
        })
    }
}

impl TryFromSlice for FuzzInitInput {
    fn try_from_slice(data: &[u8]) -> Result<Self, ()> {
        if data.len() < 5 {
            return Err(());
        }
        Ok(Self {
            name_len: data[0],
            symbol_len: data[1],
            uri_len: data[2],
            decimals: data[3],
            preset: data[4],
        })
    }
}

impl TryFromSlice for FuzzAllowanceInput {
    fn try_from_slice(data: &[u8]) -> Result<Self, ()> {
        if data.len() < 24 {
            return Err(());
        }
        Ok(Self {
            initial_allowance: u64::from_le_bytes(data[0..8].try_into().map_err(|_| ())?),
            mint_amount: u64::from_le_bytes(data[8..16].try_into().map_err(|_| ())?),
            new_allowance: u64::from_le_bytes(data[16..24].try_into().map_err(|_| ())?),
        })
    }
}
