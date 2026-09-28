#![no_std]

pub mod storage;
pub mod events;
pub mod contract;

pub use contract::{LumensVault, LumensVaultClient};

#[cfg(test)]
mod test;
