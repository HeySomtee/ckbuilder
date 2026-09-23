#![no_std]
#![no_main]

use alloc::vec::Vec;
use ckb_std::ckb_types::prelude::*;
use ckb_std::{ckb_constants::Source, error::SysError, high_level::*};
ckb_std::entry!(main);
ckb_std::default_alloc!();

// Stable diagnostic codes used by the VM tests and the devnet runner.
const SHAPE: i8 = 5;
const AUTH: i8 = 6;
const TIME: i8 = 7;
const STATE: i8 = 8;
const FUNDS: i8 = 9;
const HEADER: i8 = 10;
const MARKET: i8 = 11;
const SINCE_TIMESTAMP: u64 = 0x4000_0000_0000_0000;
const SIX_HOURS_MS: u64 = 21_600_000;
type Result<T> = core::result::Result<T, i8>;

fn require(ok: bool, code: i8) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(code)
    }
}
fn number(data: &[u8], start: usize) -> u64 {
    u64::from_le_bytes(data[start..start + 8].try_into().unwrap())
}
fn data(source: Source) -> Result<Vec<u8>> {
    load_cell_data(0, source).map_err(|_| SHAPE)
}
fn capacity(source: Source) -> Result<u64> {
    load_cell_capacity(0, source).map_err(|_| SHAPE)
}
fn count(source: Source) -> Result<usize> {
    for i in 0.. {
        match load_cell_capacity(i, source) {
            Ok(_) => (),
            Err(SysError::IndexOutOfBound) => return Ok(i),
            Err(_) => return Err(SHAPE),
        }
    }
    Err(SHAPE)
}
fn authorize(lock_hash: &[u8]) -> Result<usize> {
    for i in 0..count(Source::Input)? {
        if load_cell_lock_hash(i, Source::Input)
            .map_err(|_| AUTH)?
            .as_slice()
            == lock_hash
        {
            return Ok(i);
        }
    }
    Err(AUTH)
}
fn created_at() -> Result<u64> {
    // Source::GroupInput binds the header to this exact input's creation block.
    // Loading an arbitrary HeaderDep index would permit a stale-header bypass.
    let header = load_header(0, Source::GroupInput).map_err(|_| HEADER)?;
    Ok(header.raw().timestamp().unpack())
}
fn expired(deadline_ms: u64) -> Result<()> {
    let since = load_input_since(0, Source::GroupInput).map_err(|_| TIME)?;
    let seconds = deadline_ms.checked_add(999).ok_or(TIME)? / 1000;
    require(since >> 56 == SINCE_TIMESTAMP >> 56, TIME)?;
    require((since & 0x00ff_ffff_ffff_ffff) >= seconds, TIME)
}
fn guard(source: Source, code: &[u8], type_hash: &[u8]) -> Result<()> {
    let lock = load_cell_lock(0, source).map_err(|_| SHAPE)?;
    require(
        lock.code_hash().as_slice() == code
            && lock.hash_type().as_slice() == [4]
            && lock.args().raw_data().as_ref() == type_hash,
        SHAPE,
    )
}
fn pay(index: usize, amount: u64, owner: Option<&[u8]>) -> Result<()> {
    require(
        load_cell_capacity(index, Source::Output).map_err(|_| FUNDS)? == amount,
        FUNDS,
    )?;
    require(
        load_cell_type_hash(index, Source::Output)
            .map_err(|_| FUNDS)?
            .is_none(),
        FUNDS,
    )?;
    if let Some(hash) = owner {
        require(
            load_cell_lock_hash(index, Source::Output)
                .map_err(|_| FUNDS)?
                .as_slice()
                == hash,
            FUNDS,
        )?;
    }
    Ok(())
}
fn market_dependency(hash: &[u8], cutoff: u64, guard_code: &[u8]) -> Result<u8> {
    for i in 0.. {
        match load_cell_type_hash(i, Source::CellDep) {
            Ok(Some(h)) if h.as_slice() == hash => {
                let ty = load_cell_type(i, Source::CellDep)
                    .map_err(|_| MARKET)?
                    .ok_or(MARKET)?;
                let own = load_script().map_err(|_| MARKET)?;
                let args = ty.args().raw_data();
                require(
                    ty.code_hash() == own.code_hash() && ty.hash_type() == own.hash_type(),
                    MARKET,
                )?;
                require(args.len() == 125 && args[0] == 0, MARKET)?;
                require(
                    number(&args, 69) == cutoff && &args[93..125] == guard_code,
                    MARKET,
                )?;
                let state = load_cell_data(i, Source::CellDep).map_err(|_| MARKET)?;
                require(state.len() == 2 && state[0] <= 3, MARKET)?;
                return Ok(state[0]);
            }
            Err(SysError::IndexOutOfBound) => return Err(MARKET),
            Err(_) => return Err(MARKET),
            _ => (),
        }
    }
    Err(MARKET)
}
fn validate_market(args: &[u8], inputs: usize, outputs: usize) -> Result<()> {
    let kickoff = number(args, 69);
    let deadline = number(args, 77);
    let reward = number(args, 85);
    require(
        kickoff.checked_add(SIX_HOURS_MS) == Some(deadline) && reward > 0,
        SHAPE,
    )?;
    require(outputs == 1, STATE)?;
    let next = data(Source::GroupOutput)?;
    require(next.len() == 2, SHAPE)?;
    if inputs == 0 {
        let admin_input = authorize(&args[37..69])?;
        require(next == [0, 255], STATE)?;
        let occupied = load_cell_occupied_capacity(0, Source::GroupOutput).map_err(|_| FUNDS)?;
        require(
            capacity(Source::GroupOutput)?
                .checked_sub(reward)
                .is_some_and(|remaining| remaining >= occupied),
            FUNDS,
        )?;
        // An exact reward output must also fit the admin's lock when returned.
        let admin_lock = load_cell_lock(admin_input, Source::Input).map_err(|_| AUTH)?;
        let minimum_reward = (41 + admin_lock.args().raw_data().len() as u64)
            .checked_mul(100_000_000)
            .ok_or(FUNDS)?;
        require(reward >= minimum_reward, FUNDS)?;
        return Ok(());
    }
    let previous = data(Source::GroupInput)?;
    require(previous.len() == 2, SHAPE)?;
    match (previous[0], next[0]) {
        (0, 1) => {
            require(previous[1] == 255 && next[1] <= 2, STATE)?;
            authorize(&args[37..69])?;
            require(
                capacity(Source::GroupInput)? == capacity(Source::GroupOutput)?,
                FUNDS,
            )
        }
        (1, 2) => {
            require(previous[1] <= 2 && next[1] == previous[1], STATE)?;
            let timestamp = created_at()?;
            require(timestamp >= kickoff && timestamp < deadline, TIME)?;
            release_reward(reward, Some(&args[37..69]))
        }
        (0, 3) | (1, 3) => {
            require(next[1] == 255, STATE)?;
            expired(deadline)?;
            if previous[0] == 1 {
                let timestamp = created_at()?;
                require(timestamp < kickoff || timestamp >= deadline, TIME)?;
            } else {
                require(previous[1] == 255, STATE)?;
            }
            release_reward(reward, None)
        }
        _ => Err(STATE),
    }
}
fn release_reward(reward: u64, recipient: Option<&[u8]>) -> Result<()> {
    require(
        capacity(Source::GroupInput)?.checked_sub(reward) == Some(capacity(Source::GroupOutput)?),
        FUNDS,
    )?;
    // Protocol output is fixed at index 0; reward output at index 1.
    pay(1, reward, recipient)
}
fn validate_stake(args: &[u8], inputs: usize, outputs: usize) -> Result<()> {
    let state = data(if inputs == 0 {
        Source::GroupOutput
    } else {
        Source::GroupInput
    })?;
    require(
        state.len() == 10 && state[0] <= 1 && state[1] <= 2 && number(&state, 2) > 0,
        SHAPE,
    )?;
    let principal = number(&state, 2);
    let cutoff = number(args, 101);
    let cap_source = if inputs == 0 {
        Source::GroupOutput
    } else {
        Source::GroupInput
    };
    let occupied = load_cell_occupied_capacity(0, cap_source).map_err(|_| FUNDS)?;
    require(
        capacity(cap_source)?
            .checked_sub(occupied)
            .is_some_and(|free| free >= principal),
        FUNDS,
    )?;
    if inputs == 0 {
        require(state[0] == 0 && outputs == 1, STATE)?;
        authorize(&args[69..101])?;
        require(
            market_dependency(&args[37..69], cutoff, &args[109..141])? == 0,
            MARKET,
        )?;
        return Ok(());
    }
    if outputs == 1 {
        let next = data(Source::GroupOutput)?;
        require(
            state[0] == 0 && next.len() == 10 && next[0] == 1 && next[1..] == state[1..],
            STATE,
        )?;
        require(created_at()? < cutoff, TIME)?;
        require(
            market_dependency(&args[37..69], cutoff, &args[109..141])? != 3,
            MARKET,
        )?;
        require(
            capacity(Source::GroupInput)? == capacity(Source::GroupOutput)?,
            FUNDS,
        )
    } else {
        authorize(&args[69..101])?;
        let late = state[0] == 0 && created_at()? >= cutoff;
        if !late {
            require(
                market_dependency(&args[37..69], cutoff, &args[109..141])? == 3,
                MARKET,
            )?;
        }
        // Full principal AND storage return. A separate input funds network fees.
        pay(0, capacity(Source::GroupInput)?, Some(&args[69..101]))
    }
}
fn validate() -> Result<()> {
    let script = load_script().map_err(|_| SHAPE)?;
    let args = script.args().raw_data();
    require(
        (args.len() == 125 && args[0] == 0) || (args.len() == 141 && args[0] == 1),
        SHAPE,
    )?;
    let hash = load_script_hash().map_err(|_| SHAPE)?;
    let inputs = count(Source::GroupInput)?;
    let outputs = count(Source::GroupOutput)?;
    require(inputs <= 1 && outputs <= 1, SHAPE)?;
    // The lab deliberately processes only one protocol identity per transaction.
    // This prevents two refund groups from both counting the same owner output.
    for source in [Source::Input, Source::Output] {
        for i in 0..count(source)? {
            if let Some(ty) = load_cell_type(i, source).map_err(|_| SHAPE)? {
                if ty.code_hash() == script.code_hash() {
                    require(
                        load_cell_type_hash(i, source).map_err(|_| SHAPE)? == Some(hash),
                        SHAPE,
                    )?;
                    if matches!(source, Source::Output) {
                        require(i == 0, SHAPE)?;
                    }
                }
            }
        }
    }
    if inputs == 0 {
        let seed = load_input(0, Source::Input).map_err(|_| SHAPE)?;
        require(seed.previous_output().as_slice() == &args[1..37], SHAPE)?;
    }
    let guard_code = if args[0] == 0 {
        &args[93..125]
    } else {
        &args[109..141]
    };
    if inputs == 1 {
        guard(Source::GroupInput, guard_code, &hash)?;
    }
    if outputs == 1 {
        guard(Source::GroupOutput, guard_code, &hash)?;
    }
    if args[0] == 0 {
        validate_market(&args, inputs, outputs)
    } else {
        validate_stake(&args, inputs, outputs)
    }
}
pub fn main() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(code) => code,
    }
}
