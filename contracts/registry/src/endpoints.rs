use super::*;

/// Demo default; admins can change the stored value for future exit requests.
pub const DEFAULT_EXIT_COOLDOWN_SECONDS: u64 = 10;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EndpointListing {
    pub id: BytesN<32>,
    pub provider: Address,
    pub name: String,
    pub endpoint: String,
    pub claimed_model: String,
    pub price: i128,
    pub stake: i128,
    pub active: bool,
    pub exit_at: u64,
    pub retired: bool,
}

#[contractevent]
pub struct EndpointChanged {
    #[topic]
    pub id: BytesN<32>,
    #[topic]
    pub provider: Address,
    pub action: Symbol,
    pub amount: i128,
    pub exit_at: u64,
}

fn load_endpoint(e: &Env, id: &BytesN<32>) -> Result<EndpointListing, Error> {
    e.storage().persistent().get(&Key::Endpoint(id.clone())).ok_or(Error::NotRegistered)
}

fn save_endpoint(e: &Env, l: &EndpointListing, action: &str, amount: i128) {
    e.storage().persistent().set(&Key::Endpoint(l.id.clone()), l);
    EndpointChanged { id: l.id.clone(), provider: l.provider.clone(), action: Symbol::new(e, action), amount, exit_at: l.exit_at }.publish(e);
}

fn owned(e: &Env, provider: &Address, id: &BytesN<32>) -> Result<EndpointListing, Error> {
    provider.require_auth();
    let l = load_endpoint(e, id)?;
    if l.provider != *provider { return Err(Error::Unauthorized); }
    if l.retired { return Err(Error::Retired); }
    Ok(l)
}

fn view(e: &Env, mut l: EndpointListing) -> EndpointListing {
    l.active = l.active && !l.retired && l.stake > 0 && (l.exit_at == 0 || e.ledger().timestamp() < l.exit_at);
    l
}

#[contractimpl]
impl Registry {
    #[when_not_paused]
    pub fn register_endpoint(e: &Env, provider: Address, id: BytesN<32>, name: String, endpoint: String, claimed_model: String, price: i128, amount: i128) -> Result<(), Error> {
        provider.require_auth();
        if e.storage().persistent().has(&Key::Endpoint(id.clone())) { return Err(Error::AlreadyRegistered); }
        if price <= 0 || amount <= 0 { return Err(Error::NonPositiveAmount); }
        if name.len() == 0 || endpoint.len() == 0 || claimed_model.len() == 0 { return Err(Error::InvalidMetadata); }
        token_client(e).transfer(&provider, &e.current_contract_address(), &amount);
        let l = EndpointListing { id: id.clone(), provider, name, endpoint, claimed_model, price, stake: amount, active: true, exit_at: 0, retired: false };
        save_endpoint(e, &l, "registered", amount);
        let mut ids: Vec<BytesN<32>> = e.storage().instance().get(&Key::EndpointIds).unwrap_or(Vec::new(e));
        ids.push_back(id);
        e.storage().instance().set(&Key::EndpointIds, &ids);
        Ok(())
    }

    #[when_not_paused]
    pub fn stake_endpoint(e: &Env, provider: Address, id: BytesN<32>, amount: i128) -> Result<(), Error> {
        let mut l = owned(e, &provider, &id)?;
        if amount <= 0 { return Err(Error::NonPositiveAmount); }
        if l.exit_at != 0 { return Err(Error::ExitPending); }
        token_client(e).transfer(&provider, &e.current_contract_address(), &amount);
        l.stake = l.stake.checked_add(amount).ok_or(Error::NonPositiveAmount)?;
        save_endpoint(e, &l, "staked", amount);
        Ok(())
    }

    pub fn rename_endpoint(e: &Env, provider: Address, id: BytesN<32>, name: String) -> Result<(), Error> {
        let mut l = owned(e, &provider, &id)?;
        if name.len() == 0 { return Err(Error::InvalidMetadata); }
        l.name = name;
        save_endpoint(e, &l, "renamed", 0);
        Ok(())
    }

    pub fn exit_cooldown(e: &Env) -> u64 {
        e.storage().instance().get(&Key::ExitCooldown).unwrap_or(DEFAULT_EXIT_COOLDOWN_SECONDS)
    }

    #[only_admin]
    pub fn set_exit_cooldown(e: &Env, _caller: Address, seconds: u64) -> Result<(), Error> {
        if seconds == 0 { return Err(Error::InvalidCooldown); }
        e.storage().instance().set(&Key::ExitCooldown, &seconds);
        Ok(())
    }

    pub fn request_exit(e: &Env, provider: Address, id: BytesN<32>) -> Result<u64, Error> {
        let mut l = owned(e, &provider, &id)?;
        if l.exit_at != 0 { return Err(Error::ExitPending); }
        l.exit_at = e.ledger().timestamp().checked_add(Self::exit_cooldown(e)).ok_or(Error::InvalidCooldown)?;
        save_endpoint(e, &l, "exit_requested", 0);
        Ok(l.exit_at)
    }

    pub fn cancel_exit(e: &Env, provider: Address, id: BytesN<32>) -> Result<(), Error> {
        let mut l = owned(e, &provider, &id)?;
        if l.exit_at == 0 { return Err(Error::ExitNotRequested); }
        if e.ledger().timestamp() >= l.exit_at { return Err(Error::ExitExpired); }
        l.exit_at = 0;
        save_endpoint(e, &l, "exit_cancelled", 0);
        Ok(())
    }

    pub fn withdraw_endpoint(e: &Env, provider: Address, id: BytesN<32>) -> Result<i128, Error> {
        let mut l = owned(e, &provider, &id)?;
        if l.exit_at == 0 { return Err(Error::ExitNotRequested); }
        if e.ledger().timestamp() < l.exit_at { return Err(Error::CooldownPending); }
        let amount = l.stake;
        l.stake = 0;
        l.active = false;
        l.retired = true;
        save_endpoint(e, &l, "withdrawn", amount);
        if amount > 0 { token_client(e).transfer(&e.current_contract_address(), &provider, &amount); }
        Ok(amount)
    }

    #[only_role(caller, "auditor")]
    pub fn slash_endpoint(e: &Env, caller: Address, id: BytesN<32>) -> Result<i128, Error> {
        let mut l = load_endpoint(e, &id)?;
        let amount = l.stake;
        if amount == 0 { return Ok(0); }
        l.stake = 0;
        save_endpoint(e, &l, "slashed", amount);
        let treasury: Address = e.storage().instance().get(&Key::Treasury).unwrap();
        token_client(e).transfer(&e.current_contract_address(), &treasury, &amount);
        Ok(amount)
    }

    #[only_role(caller, "auditor")]
    pub fn pause_endpoint(e: &Env, caller: Address, id: BytesN<32>) -> Result<(), Error> {
        let mut l = load_endpoint(e, &id)?;
        l.active = false;
        save_endpoint(e, &l, "paused", 0);
        Ok(())
    }

    pub fn get_endpoint(e: &Env, id: BytesN<32>) -> Option<EndpointListing> {
        load_endpoint(e, &id).ok().map(|l| view(e, l))
    }

    pub fn is_endpoint_active(e: &Env, id: BytesN<32>) -> bool {
        Self::get_endpoint(e, id).map(|l| l.active).unwrap_or(false)
    }

    pub fn list_endpoints(e: &Env) -> Vec<EndpointListing> {
        let ids: Vec<BytesN<32>> = e.storage().instance().get(&Key::EndpointIds).unwrap_or(Vec::new(e));
        let mut out = Vec::new(e);
        for id in ids.iter() {
            if let Ok(l) = load_endpoint(e, &id) { out.push_back(view(e, l)); }
        }
        out
    }
}
