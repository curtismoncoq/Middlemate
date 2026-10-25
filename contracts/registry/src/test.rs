#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env, String,
};

const TEN: i128 = 10_0000000;

struct Setup<'a> {
    env: Env,
    reg: RegistryClient<'a>,
    token: TokenClient<'a>,
    admin: Address,
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
    Setup { env, reg, token, admin, auditor, treasury }
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

fn endpoint(s: &Setup, p: &Address, n: u8, name: &str) -> BytesN<32> {
    let id = BytesN::from_array(&s.env, &[n; 32]);
    s.reg.register_endpoint(p, &id, &String::from_str(&s.env, name), &String::from_str(&s.env, "https://weather.example/forecast"), &String::from_str(&s.env, "api:weather@1"), &10000, &TEN);
    id
}

#[test]
fn wallet_owns_multiple_independently_staked_endpoints() {
    let s = setup();
    let p = funded_provider(&s);
    let a = endpoint(&s, &p, 1, "Weather by Mat");
    let b = endpoint(&s, &p, 2, "Mat rain API");
    assert_eq!(s.reg.list_endpoints().len(), 2);
    assert_eq!(s.reg.get_endpoint(&a).unwrap().name, String::from_str(&s.env, "Weather by Mat"));
    s.reg.slash_endpoint(&s.auditor, &a);
    s.reg.pause_endpoint(&s.auditor, &a);
    assert!(!s.reg.is_endpoint_active(&a));
    assert!(s.reg.is_endpoint_active(&b));
    assert_eq!(s.reg.get_endpoint(&b).unwrap().stake, TEN);
}

#[test]
fn endpoint_exit_waits_ten_seconds_and_refunds_only_its_owner() {
    let s = setup();
    let p = funded_provider(&s);
    s.env.ledger().set_timestamp(100);
    let id = endpoint(&s, &p, 3, "Exit");
    assert_eq!(s.reg.request_exit(&p, &id), 110);
    assert!(s.reg.is_endpoint_active(&id));
    assert_eq!(s.reg.try_withdraw_endpoint(&p, &id), Err(Ok(Error::CooldownPending)));
    s.env.ledger().set_timestamp(110);
    assert!(!s.reg.is_endpoint_active(&id));
    assert_eq!(s.reg.withdraw_endpoint(&p, &id), TEN);
    assert_eq!(s.token.balance(&p), 3 * TEN);
    assert!(s.reg.get_endpoint(&id).unwrap().retired);
    assert_eq!(s.reg.try_withdraw_endpoint(&p, &id), Err(Ok(Error::Retired)));
}

#[test]
fn endpoint_owner_checks_and_slashing_during_exit() {
    let s = setup();
    let p = funded_provider(&s);
    let stranger = funded_provider(&s);
    let id = endpoint(&s, &p, 4, "Protected");
    assert_eq!(s.reg.try_request_exit(&stranger, &id), Err(Ok(Error::Unauthorized)));
    assert_eq!(s.reg.try_stake_endpoint(&stranger, &id, &TEN), Err(Ok(Error::Unauthorized)));
    assert_eq!(s.reg.try_rename_endpoint(&stranger, &id, &String::from_str(&s.env, "Stolen")), Err(Ok(Error::Unauthorized)));
    s.reg.rename_endpoint(&p, &id, &String::from_str(&s.env, "Renamed"));
    assert_eq!(s.reg.get_endpoint(&id).unwrap().name, String::from_str(&s.env, "Renamed"));
    s.reg.request_exit(&p, &id);
    assert!(s.reg.try_slash_endpoint(&stranger, &id).is_err());
    assert!(s.reg.try_pause_endpoint(&stranger, &id).is_err());
    assert_eq!(s.reg.slash_endpoint(&s.auditor, &id), TEN);
    s.env.ledger().set_timestamp(10);
    assert_eq!(s.reg.try_withdraw_endpoint(&stranger, &id), Err(Ok(Error::Unauthorized)));
    assert_eq!(s.reg.withdraw_endpoint(&p, &id), 0);
    assert_eq!(s.token.balance(&s.treasury), TEN);
}

#[test]
fn exit_config_and_cancel_do_not_undo_audit_pause() {
    let s = setup();
    let p = funded_provider(&s);
    let id = endpoint(&s, &p, 5, "Cancel");
    s.reg.set_exit_cooldown(&s.admin, &60);
    assert_eq!(s.reg.exit_cooldown(), 60);
    assert_eq!(s.reg.request_exit(&p, &id), 60);
    s.reg.pause_endpoint(&s.auditor, &id);
    s.reg.cancel_exit(&p, &id);
    assert!(!s.reg.is_endpoint_active(&id));
    assert_eq!(s.reg.get_endpoint(&id).unwrap().exit_at, 0);
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

#[test]
fn provider_unregister_refunds_stake_and_removes_listing() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    s.reg.stake(&p, &TEN);
    s.reg.unregister(&p, &p);
    assert!(s.reg.get(&p).is_none());
    assert_eq!(s.reg.list().len(), 0);
    assert_eq!(s.token.balance(&p), 3 * TEN);
    assert_eq!(s.token.balance(&s.reg.address), 0);
}

#[test]
fn admin_can_unregister_any_listing() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    s.reg.stake(&p, &TEN);
    s.reg.unregister(&s.admin, &p);
    assert!(s.reg.get(&p).is_none());
    assert_eq!(s.token.balance(&p), 3 * TEN);
}

#[test]
fn stranger_cannot_unregister() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    let rando = Address::generate(&s.env);
    assert_eq!(s.reg.try_unregister(&rando, &p), Err(Ok(Error::Unauthorized)));
}

#[test]
fn unregister_after_slash_refunds_nothing() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "CheapMax");
    s.reg.stake(&p, &TEN);
    s.reg.slash(&s.auditor, &p);
    s.reg.unregister(&p, &p);
    assert_eq!(s.token.balance(&p), 2 * TEN);
    assert_eq!(s.token.balance(&s.treasury), TEN);
}

#[test]
fn can_register_again_after_unregister() {
    let s = setup();
    let p = funded_provider(&s);
    register(&s, &p, "A");
    s.reg.unregister(&p, &p);
    register(&s, &p, "A2");
    assert_eq!(s.reg.list().len(), 1);
    assert_eq!(s.reg.get(&p).unwrap().name, String::from_str(&s.env, "A2"));
}

#[test]
fn unregister_unknown_fails() {
    let s = setup();
    let p = Address::generate(&s.env);
    assert_eq!(s.reg.try_unregister(&p, &p), Err(Ok(Error::NotRegistered)));
}
