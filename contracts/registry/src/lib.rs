#![no_std]
//! TrustBazaar registry: providers register an endpoint and stake a token;
//! the auditor role can slash a provider's full stake to the treasury and
//! delist it. Admin can pause the whole registry (OZ Pausable).

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Symbol, Vec, BytesN,
};
use stellar_access::access_control::{self as access_control, AccessControl};
use stellar_contract_utils::pausable::{self as pausable, Pausable};
use stellar_macros::{only_admin, only_role, when_not_paused};

const AUDITOR: Symbol = symbol_short!("auditor");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// AlreadyRegistered
    AlreadyRegistered = 1,
    /// NotRegistered
    NotRegistered = 2,
    /// NonPositiveAmount
    NonPositiveAmount = 3,
    /// Unauthorized
    Unauthorized = 4,
    CooldownPending = 5,
    Retired = 6,
    ExitNotRequested = 7,
    ExitPending = 8,
    InvalidCooldown = 9,
    ExitExpired = 10,
    InvalidMetadata = 11,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub provider: Address,
    pub name: String,
    pub endpoint: String,
    pub claimed_model: String,
    /// Price per request in token atomic units (7 decimals for USDC).
    pub price: i128,
    pub stake: i128,
    pub active: bool,
}

#[contracttype]
enum Key {
    Token,
    Treasury,
    Providers,
    Listing(Address),
    EndpointIds,
    Endpoint(BytesN<32>),
    ExitCooldown,
}

#[contractevent]
pub struct Slashed {
    #[topic]
    pub provider: Address,
    pub amount: i128,
}

#[contractevent]
pub struct ListingPaused {
    #[topic]
    pub provider: Address,
}

#[contractevent]
pub struct Unregistered {
    #[topic]
    pub provider: Address,
    pub refunded: i128,
}

#[contract]
pub struct Registry;

fn load(e: &Env, provider: &Address) -> Result<Listing, Error> {
    e.storage().persistent().get(&Key::Listing(provider.clone())).ok_or(Error::NotRegistered)
}

fn save(e: &Env, l: &Listing) {
    e.storage().persistent().set(&Key::Listing(l.provider.clone()), l);
}

fn token_client(e: &Env) -> token::Client<'_> {
    let addr: Address = e.storage().instance().get(&Key::Token).unwrap();
    token::Client::new(e, &addr)
}

#[contractimpl]
impl Registry {
    pub fn __constructor(e: &Env, admin: Address, auditor: Address, token: Address, treasury: Address) {
        access_control::set_admin(e, &admin);
        access_control::grant_role_no_auth(e, &auditor, &AUDITOR, &admin);
        e.storage().instance().set(&Key::Token, &token);
        e.storage().instance().set(&Key::Treasury, &treasury);
        e.storage().instance().set(&Key::Providers, &Vec::<Address>::new(e));
    }

    #[when_not_paused]
    pub fn register(
        e: &Env,
        provider: Address,
        name: String,
        endpoint: String,
        claimed_model: String,
        price: i128,
    ) -> Result<(), Error> {
        provider.require_auth();
        if e.storage().persistent().has(&Key::Listing(provider.clone())) {
            return Err(Error::AlreadyRegistered);
        }
        if price <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        save(e, &Listing { provider: provider.clone(), name, endpoint, claimed_model, price, stake: 0, active: true });
        let mut providers: Vec<Address> = e.storage().instance().get(&Key::Providers).unwrap();
        providers.push_back(provider);
        e.storage().instance().set(&Key::Providers, &providers);
        Ok(())
    }

    #[when_not_paused]
    pub fn stake(e: &Env, provider: Address, amount: i128) -> Result<(), Error> {
        provider.require_auth();
        if amount <= 0 {
            return Err(Error::NonPositiveAmount);
        }
        let mut l = load(e, &provider)?;
        token_client(e).transfer(&provider, &e.current_contract_address(), &amount);
        l.stake += amount;
        save(e, &l);
        Ok(())
    }

    /// Moves the provider's full stake to the treasury. Returns the amount slashed (0 if none left).
    #[only_role(caller, "auditor")]
    pub fn slash(e: &Env, caller: Address, provider: Address) -> Result<i128, Error> {
        let mut l = load(e, &provider)?;
        let amount = l.stake;
        if amount == 0 {
            return Ok(0);
        }
        let treasury: Address = e.storage().instance().get(&Key::Treasury).unwrap();
        token_client(e).transfer(&e.current_contract_address(), &treasury, &amount);
        l.stake = 0;
        save(e, &l);
        Slashed { provider, amount }.publish(e);
        Ok(amount)
    }

    /// Delists one provider. The listing stays readable via `get`/`list`.
    #[only_role(caller, "auditor")]
    pub fn pause_listing(e: &Env, caller: Address, provider: Address) -> Result<(), Error> {
        let mut l = load(e, &provider)?;
        if l.active {
            l.active = false;
            save(e, &l);
            ListingPaused { provider }.publish(e);
        }
        Ok(())
    }

    /// Removes a listing and refunds any remaining stake to the provider. Callable by the provider or the admin.
    pub fn unregister(e: &Env, caller: Address, provider: Address) -> Result<i128, Error> {
        caller.require_auth();
        if caller != provider && access_control::get_admin(e) != Some(caller) {
            return Err(Error::Unauthorized);
        }
        let l = load(e, &provider)?;
        if l.stake > 0 {
            token_client(e).transfer(&e.current_contract_address(), &provider, &l.stake);
        }
        e.storage().persistent().remove(&Key::Listing(provider.clone()));
        let providers: Vec<Address> = e.storage().instance().get(&Key::Providers).unwrap();
        let mut kept = Vec::new(e);
        for p in providers.iter() {
            if p != provider {
                kept.push_back(p);
            }
        }
        e.storage().instance().set(&Key::Providers, &kept);
        Unregistered { provider, refunded: l.stake }.publish(e);
        Ok(l.stake)
    }

    pub fn is_active(e: &Env, provider: Address) -> bool {
        match load(e, &provider) {
            Ok(l) => l.active && l.stake > 0,
            Err(_) => false,
        }
    }

    pub fn get(e: &Env, provider: Address) -> Option<Listing> {
        load(e, &provider).ok()
    }

    pub fn list(e: &Env) -> Vec<Listing> {
        let providers: Vec<Address> = e.storage().instance().get(&Key::Providers).unwrap();
        let mut out = Vec::new(e);
        for p in providers.iter() {
            if let Ok(l) = load(e, &p) {
                out.push_back(l);
            }
        }
        out
    }
}

#[contractimpl(contracttrait)]
impl AccessControl for Registry {}

#[contractimpl]
impl Pausable for Registry {
    fn paused(e: &Env) -> bool {
        pausable::paused(e)
    }

    #[only_admin]
    fn pause(e: &Env, _caller: Address) {
        pausable::pause(e);
    }

    #[only_admin]
    fn unpause(e: &Env, _caller: Address) {
        pausable::unpause(e);
    }
}

mod test;
mod endpoints;
