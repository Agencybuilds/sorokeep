use soroban_sdk::{contract, contracterror, contractimpl, Address, Env};

use crate::storage::{DataKey, VaultEntry, VaultEntryV2};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VaultNotFound = 1,
}

/// Must differ from the real contract's VERSION constant — this is the
/// signal the test uses to prove the running bytecode genuinely changed.
pub const VERSION: u32 = 2;

#[contract]
pub struct LumensVault;

#[contractimpl]
impl LumensVault {
    pub fn version(_env: Env) -> u32 {
        VERSION
    }

    /// This is the actual claim the whole upgrade design rests on, made
    /// concrete: data written by the OLD binary as `VaultEntry::V1(..)`
    /// must be readable by the NEW binary's own code, and here it's
    /// migrated into the V2 shape on read (lazy migration) rather than
    /// just proven-not-to-panic. If a real V2 needs eager migration
    /// instead (rewriting storage in place), that's a deliberate design
    /// choice to make when you build the real V2 — this fixture only
    /// needs to prove the mechanism works at all.
    pub fn get_vault(
        env: Env,
        user: Address,
        asset: Address,
        vault_id: u32,
    ) -> Result<VaultEntryV2, Error> {
        let key = DataKey::Vault(user, asset, vault_id);
        let stored: VaultEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::VaultNotFound)?;

        let migrated = match stored {
            VaultEntry::V1(e) => VaultEntryV2 {
                amount: e.amount,
                unlock_ledger: e.unlock_ledger,
                last_touched_ledger: env.ledger().sequence(),
            },
            VaultEntry::V2(e) => e,
        };

        Ok(migrated)
    }
}
