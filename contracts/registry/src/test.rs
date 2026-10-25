#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env, String,
};

const TEN: i128 = 10_0000000;

struct Setup<'a> {
    env: Env,
    reg: RegistryClient<'a>,
    token: TokenClient<'a>,
    auditor: Address,
    treasury: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let auditor = Address::generate(&env);
    let treasury = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let id = env.register(Registry, (admin.clone(), auditor.clone(), sac.address(), treasury.clone()));
    let reg = RegistryClient::new(&env, &id);
    let token = TokenClient::new(&env, &sac.address());
    Setup { env, reg, token, auditor, treasury }
}

fn funded_provider(s: &Setup) -> Address {
    let p = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token.address).mint(&p, &(3 * TEN));
    p
}

fn register(s: &Setup, p: &Address, name: &str) {
    let e = &s.env;
    s.reg.register(
        p,
        &String::from_str(e, name),
        &String::from_str(e, "http://localhost:4001/x/v1/chat/completions"),
        &String::from_str(e, "MiniMax-M2.7"),
        &120000,
    );
}

#[test]
fn register_then_stake_is_active() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    assert!(!s.reg.is_active(&p));
    s.reg.stake(&p, &TEN);
    assert!(s.reg.is_active(&p));
    assert_eq!(s.token.balance(&s.reg.address), TEN);
    assert_eq!(s.reg.get(&p).unwrap().stake, TEN);
}

#[test]
fn register_twice_fails() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    let e = &s.env;
    let r = s.reg.try_register(
        &p,
        &String::from_str(e, "A"),
        &String::from_str(e, "u"),
        &String::from_str(e, "m"),
        &1,
    );
    assert_eq!(r, Err(Ok(Error::AlreadyRegistered)));
}

#[test]
fn stake_zero_fails() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    assert_eq!(s.reg.try_stake(&p, &0), Err(Ok(Error::NonPositiveAmount)));
}

#[test]
fn stake_unregistered_fails() {
    let s = setup();
    let p = funded_provider(&s);
    assert_eq!(s.reg.try_stake(&p, &TEN), Err(Ok(Error::NotRegistered)));
}

#[test]
fn slash_moves_full_stake_to_treasury() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "CheapMax");
    s.reg.stake(&p, &TEN);
    assert_eq!(s.reg.slash(&s.auditor, &p), TEN);
    assert_eq!(s.token.balance(&s.treasury), TEN);
    assert_eq!(s.token.balance(&s.reg.address), 0);
    assert_eq!(s.reg.get(&p).unwrap().stake, 0);
    assert!(!s.reg.is_active(&p));
}

#[test]
fn slash_twice_returns_zero() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "CheapMax");
    s.reg.stake(&p, &TEN);
    s.reg.slash(&s.auditor, &p);
    assert_eq!(s.reg.slash(&s.auditor, &p), 0);
    assert_eq!(s.token.balance(&s.treasury), TEN);
}

#[test]
fn non_auditor_cannot_slash() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "CheapMax");
    s.reg.stake(&p, &TEN);
    let rando = Address::generate(&s.env);
    assert!(s.reg.try_slash(&rando, &p).is_err());
    assert_eq!(s.reg.get(&p).unwrap().stake, TEN);
}

#[test]
fn non_auditor_cannot_pause_listing() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    let rando = Address::generate(&s.env);
    assert!(s.reg.try_pause_listing(&rando, &p).is_err());
}

#[test]
fn pause_listing_hides_but_list_keeps() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    s.reg.stake(&p, &TEN);
    s.reg.pause_listing(&s.auditor, &p);
    assert!(!s.reg.is_active(&p));
    let all = s.reg.list();
    assert_eq!(all.len(), 1);
    assert!(!all.get(0).unwrap().active);
}

#[test]
fn list_returns_all_in_register_order() {
    let s = setup();
    let a = funded_provider(&s);
    let b = funded_provider(&s);
    register(&s, &a, "A");
    register(&s, &b, "B");
    let all = s.reg.list();
    assert_eq!(all.len(), 2);
    assert_eq!(all.get(0).unwrap().provider, a);
    assert_eq!(all.get(1).unwrap().name, String::from_str(&s.env, "B"));
}

#[test]
fn unknown_provider_is_not_active_and_get_is_none() {
    let s = setup();
    let p = Address::generate(&s.env);
    assert!(!s.reg.is_active(&p));
    assert!(s.reg.get(&p).is_none());
}
