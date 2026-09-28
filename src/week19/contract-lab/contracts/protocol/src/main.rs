#![no_std]
#![no_main]

use alloc::{vec, vec::Vec};
use ckb_std::ckb_types::prelude::*;
use ckb_std::{ckb_constants::Source, error::SysError, high_level::*};
ckb_std::entry!(main);
ckb_std::default_alloc!();

const CKB: u64 = 100_000_000;
const STORAGE: u64 = 500 * CKB;
const RESERVE: u64 = 1000 * CKB;
const SHARDS: usize = 4;
const LIMIT: usize = 8;
type R<T> = core::result::Result<T, i8>;
fn need(ok: bool, code: i8) -> R<()> {
    if ok {
        Ok(())
    } else {
        Err(code)
    }
}
fn n(d: &[u8], i: usize) -> u64 {
    u64::from_le_bytes(d[i..i + 8].try_into().unwrap())
}
fn add(a: u64, b: u64) -> R<u64> {
    a.checked_add(b).ok_or(9)
}
fn sub(a: u64, b: u64) -> R<u64> {
    a.checked_sub(b).ok_or(9)
}
#[derive(Clone, PartialEq, Eq)]
struct Ticket {
    owner: [u8; 32],
    outcome: u8,
    amount: u64,
}
impl Ticket {
    fn read(d: &[u8]) -> R<Self> {
        need(d.len() == 41, 5)?;
        let t = Self {
            owner: d[..32].try_into().unwrap(),
            outcome: d[32],
            amount: n(d, 33),
        };
        need(t.outcome < 3 && t.amount >= 100 * CKB, 9)?;
        Ok(t)
    }
    fn bytes(&self) -> Vec<u8> {
        let mut v = self.owner.to_vec();
        v.push(self.outcome);
        v.extend(self.amount.to_le_bytes());
        v
    }
}
struct Cell {
    index: usize,
    data: Vec<u8>,
    cap: u64,
}
fn count(s: Source) -> R<usize> {
    for i in 0.. {
        match load_cell_capacity(i, s) {
            Ok(_) => (),
            Err(SysError::IndexOutOfBound) => return Ok(i),
            _ => return Err(5),
        }
    }
    Err(5)
}
fn cells(s: Source, args: &[u8], hash: &[u8]) -> R<Vec<Cell>> {
    let script = load_script().map_err(|_| 5)?;
    let mut result = vec![];
    for i in 0..count(s)? {
        if let Some(t) = load_cell_type(i, s).map_err(|_| 5)? {
            if t.code_hash() == script.code_hash() {
                need(t == script, 5)?;
                let lock = load_cell_lock(i, s).map_err(|_| 5)?;
                need(
                    lock.code_hash().as_slice() == &args[76..108]
                        && lock.hash_type().as_slice() == [4]
                        && lock.args().raw_data().as_ref() == hash,
                    5,
                )?;
                result.push(Cell {
                    index: i,
                    data: load_cell_data(i, s).map_err(|_| 5)?,
                    cap: load_cell_capacity(i, s).map_err(|_| 5)?,
                });
            }
        }
    }
    Ok(result)
}
fn auth(hash: &[u8]) -> R<()> {
    for i in 0..count(Source::Input)? {
        if load_cell_lock_hash(i, Source::Input)
            .map_err(|_| 6)?
            .as_slice()
            == hash
        {
            // Bound recipient lock size so fixed storage and payout capacities fit.
            need(
                load_cell_lock(i, Source::Input)
                    .map_err(|_| 6)?
                    .args()
                    .raw_data()
                    .len()
                    <= 20,
                6,
            )?;
            return Ok(());
        }
    }
    Err(6)
}
fn timestamp(c: &Cell) -> R<u64> {
    Ok(load_header(c.index, Source::Input)
        .map_err(|_| 10)?
        .raw()
        .timestamp()
        .unpack())
}
fn expired(c: &Cell, deadline: u64) -> R<()> {
    let since = load_input_since(c.index, Source::Input).map_err(|_| 7)?;
    need(
        since >> 56 == 0x40 && since & 0x00ff_ffff_ffff_ffff >= deadline.div_ceil(1000),
        7,
    )
}
fn plain(index: usize, hash: &[u8], cap: u64) -> R<()> {
    need(
        load_cell_type_hash(index, Source::Output)
            .map_err(|_| 5)?
            .is_none(),
        5,
    )?;
    need(
        load_cell_lock_hash(index, Source::Output)
            .map_err(|_| 6)?
            .as_slice()
            == hash,
        6,
    )?;
    need(
        load_cell_capacity(index, Source::Output).map_err(|_| 9)? == cap,
        9,
    )?;
    need(
        load_cell_data(index, Source::Output)
            .map_err(|_| 5)?
            .is_empty(),
        5,
    )
}
fn shard(d: &[u8]) -> R<(u8, Vec<Ticket>, Option<Ticket>)> {
    need(
        d.len() >= 4 && d[0] == 1 && d[1] < SHARDS as u8 && d[2] as usize <= LIMIT && d[3] <= 1,
        5,
    )?;
    let total = d[2] as usize + d[3] as usize;
    need(total <= LIMIT && d.len() == 4 + 41 * total, 5)?;
    let mut ts = vec![];
    for j in 0..d[2] as usize {
        ts.push(Ticket::read(&d[4 + j * 41..4 + (j + 1) * 41])?);
    }
    let pending = if d[3] == 1 {
        Some(Ticket::read(&d[d.len() - 41..])?)
    } else {
        None
    };
    Ok((d[1], ts, pending))
}
fn shard_bytes(id: u8, ts: &[Ticket], p: &Ticket) -> Vec<u8> {
    let mut d = vec![1, id, ts.len() as u8, 1];
    for t in ts {
        d.extend(t.bytes())
    }
    d.extend(p.bytes());
    d
}
fn market_dep(hash: &[u8]) -> R<()> {
    for i in 0..count(Source::CellDep)? {
        if load_cell_type_hash(i, Source::CellDep)
            .map_err(|_| 5)?
            .map(|h| h.to_vec())
            == Some(hash.to_vec())
            && load_cell_data(i, Source::CellDep).map_err(|_| 5)? == [0, 0, 255]
        {
            return Ok(());
        }
    }
    Err(11)
}
fn pool(outcome: u8, totals: [u64; 3], mask: u64) -> Vec<u8> {
    let mut d = vec![2, outcome];
    for t in totals {
        d.extend(t.to_le_bytes())
    }
    d.extend(mask.to_le_bytes());
    d
}
fn payout(t: &Ticket, outcome: u8, totals: [u64; 3]) -> R<u64> {
    if outcome == 255 || totals[outcome as usize] == 0 {
        return add(STORAGE, t.amount);
    }
    if t.outcome != outcome {
        return Ok(STORAGE);
    }
    let w = totals[outcome as usize];
    let total = add(add(totals[0], totals[1])?, totals[2])?;
    let losing = sub(total, w)?;
    let profit = losing - losing / 50 - losing / 100;
    let reward = (t.amount as u128 * profit as u128 / w as u128) as u64;
    add(add(STORAGE, t.amount)?, reward)
}
fn validate() -> R<()> {
    let script = load_script().map_err(|_| 5)?;
    let raw = script.args().raw_data();
    let a = raw.as_ref();
    need(a.len() == 172, 5)?;
    let cutoff = n(a, 68);
    let deadline = add(cutoff, 21_600_000)?;
    let hash = load_script_hash().map_err(|_| 5)?;
    let ins = cells(Source::Input, a, &hash)?;
    let outs = cells(Source::Output, a, &hash)?;
    // A single market type group validates all roles and all monetary outputs.
    for (j, c) in outs.iter().enumerate() {
        need(c.index == j, 5)?;
    }
    if ins.is_empty() {
        auth(&a[36..68])?;
        need(
            load_input(0, Source::Input)
                .map_err(|_| 5)?
                .previous_output()
                .as_slice()
                == &a[..36],
            6,
        )?;
        need(
            outs.len() == SHARDS + 1 && outs[0].data == [0, 0, 255] && outs[0].cap == RESERVE,
            5,
        )?;
        for (id, c) in outs[1..].iter().enumerate() {
            need(c.data == [1, id as u8, 0, 0] && c.cap == RESERVE, 5)?;
        }
        return Ok(());
    }
    need(!ins[0].data.is_empty(), 5)?;
    match ins[0].data[0] {
        1 => {
            need(ins.len() == 1 && outs.len() == 1, 5)?;
            market_dep(&hash)?;
            let (id, mut accepted, pending) = shard(&ins[0].data)?;
            let mut expected = ins[0].cap;
            if let Some(p) = pending {
                if timestamp(&ins[0])? < cutoff {
                    accepted.push(p);
                } else {
                    let refund = add(p.amount, STORAGE)?;
                    plain(1, &p.owner, refund)?;
                    expected = sub(expected, refund)?;
                }
            }
            need(accepted.len() < LIMIT, 8)?;
            let (out_id, out_accepted, new) = shard(&outs[0].data)?;
            let new = new.ok_or(8)?;
            auth(&new.owner)?;
            need(
                out_id == id
                    && out_accepted == accepted
                    && outs[0].data == shard_bytes(id, &accepted, &new),
                8,
            )?;
            need(outs[0].cap == add(expected, add(new.amount, STORAGE)?)?, 9)
        }
        0 => {
            let m = &ins[0];
            need(m.data.len() == 3, 5)?;
            if ins.len() == 1 {
                need(
                    m.data == [0, 0, 255]
                        && outs.len() == 1
                        && outs[0].data.len() == 3
                        && outs[0].data[0..2] == [0, 1]
                        && outs[0].data[2] < 3,
                    8,
                )?;
                auth(&a[36..68])?;
                return need(outs[0].cap == m.cap, 9);
            }
            need(ins.len() == SHARDS + 1 && !outs.is_empty(), 5)?;
            let outcome = if m.data[1] == 1 && {
                let t = timestamp(m)?;
                t >= cutoff && t < deadline
            } {
                m.data[2]
            } else {
                expired(m, deadline)?;
                255
            };
            need(outcome < 3 || outcome == 255, 8)?;
            let mut tickets = vec![];
            let mut late = vec![];
            let mut totals = [0u64; 3];
            let mut capacity = m.cap;
            for (id, c) in ins[1..].iter().enumerate() {
                let (actual, mut ts, p) = shard(&c.data)?;
                need(actual as usize == id, 8)?;
                capacity = add(capacity, c.cap)?;
                if let Some(t) = p {
                    if timestamp(c)? < cutoff {
                        ts.push(t)
                    } else {
                        late.push(t)
                    }
                }
                for t in ts {
                    totals[t.outcome as usize] = add(totals[t.outcome as usize], t.amount)?;
                    tickets.push(t);
                }
            }
            let mask = (1u64 << tickets.len()) - 1;
            need(
                outs.len() == 1 + tickets.len() && outs[0].data == pool(outcome, totals, mask),
                8,
            )?;
            for (id, t) in tickets.iter().enumerate() {
                let mut d = vec![3, id as u8];
                d.extend(t.bytes());
                need(outs[id + 1].data == d && outs[id + 1].cap == STORAGE, 9)?;
                capacity = sub(capacity, STORAGE)?;
            }
            let mut index = outs.len();
            for t in late {
                let refund = add(t.amount, STORAGE)?;
                plain(index, &t.owner, refund)?;
                capacity = sub(capacity, refund)?;
                index += 1;
            }
            let total = add(add(totals[0], totals[1])?, totals[2])?;
            let losing = if outcome == 255 || totals[outcome as usize] == 0 {
                0
            } else {
                total - totals[outcome as usize]
            };
            // Fixed output capacity comes from the operator reserve, never stake principal.
            if losing > 0 {
                for (recipient, fee) in [(&a[108..140], losing / 50), (&a[140..172], losing / 100)]
                {
                    let payment = add(100 * CKB, fee)?;
                    plain(index, recipient, payment)?;
                    capacity = sub(capacity, payment)?;
                    index += 1;
                }
            }
            if outcome == 255 {
                let recipient = load_cell_lock_hash(index, Source::Output).map_err(|_| 5)?;
                plain(index, &recipient, 100 * CKB)?;
                capacity = sub(capacity, 100 * CKB)?;
            }
            need(outs[0].cap == capacity, 9)
        }
        2 => {
            let p = &ins[0];
            need(p.data.len() == 34, 5)?;
            let outcome = p.data[1];
            need(outcome < 3 || outcome == 255, 8)?;
            let totals = [n(&p.data, 2), n(&p.data, 10), n(&p.data, 18)];
            let mask = n(&p.data, 26);
            if mask == 0 {
                need(ins.len() == 1 && outs.is_empty(), 8)?;
                return plain(0, &a[36..68], p.cap);
            }
            need(
                ins.len() == 2 && outs.len() == 1 && ins[1].data.len() == 43 && ins[1].data[0] == 3,
                5,
            )?;
            let id = ins[1].data[1];
            need(
                id < 32 && mask & (1u64 << id) != 0 && ins[1].cap == STORAGE,
                8,
            )?;
            let t = Ticket::read(&ins[1].data[2..])?;
            let value = payout(&t, outcome, totals)?;
            need(
                outs[0].data == pool(outcome, totals, mask & !(1u64 << id)),
                8,
            )?;
            need(outs[0].cap == sub(add(p.cap, STORAGE)?, value)?, 9)?;
            plain(1, &t.owner, value)
        }
        _ => Err(8),
    }
}
pub fn main() -> i8 {
    match validate() {
        Ok(()) => 0,
        Err(e) => e,
    }
}
