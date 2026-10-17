use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{Capacity, HeaderBuilder, ScriptHashType, TransactionBuilder},
    packed::*,
    prelude::*,
};
use ckb_testtool::{builtin::ALWAYS_SUCCESS, context::Context};
use std::{fs, path::Path};
const C: u64 = 100_000_000;
const K: u64 = 1_800_000_000_000;
const R: u64 = 610 * C;
const S: u64 = 321 * C;
struct Lab {
    ctx: Context,
    ty: Script,
    guard: Script,
    admin: Script,
    owner: Script,
    seed: OutPoint,
}
impl Lab {
    fn new() -> Self {
        Self::with_arg_lengths(5, 5)
    }
    fn with_arg_lengths(admin_len: usize, owner_len: usize) -> Self {
        let mut ctx = Context::default();
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../target/riscv64imac-unknown-none-elf/release");
        let p = ctx.deploy_cell(fs::read(root.join("streak-protocol-v4")).unwrap().into());
        let g = ctx.deploy_cell(fs::read(root.join("streak-guard")).unwrap().into());
        let s = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let admin = ctx.build_script(&s, vec![b'a'; admin_len].into()).unwrap();
        let owner = ctx.build_script(&s, vec![b'o'; owner_len].into()).unwrap();
        let seed = ctx.create_cell(
            CellOutput::new_builder()
                .capacity(100_000 * C)
                .lock(admin.clone())
                .build(),
            Bytes::new(),
        );
        let guard = ctx
            .build_script_with_hash_type(&g, ScriptHashType::Data2, Bytes::new())
            .unwrap();
        let mut digest = [0u8; 32];
        let mut hasher = blake2b_ref::Blake2bBuilder::new(32)
            .personal(b"ckb-default-hash")
            .build();
        hasher.update(seed.as_slice());
        hasher.finalize(&mut digest);
        let mut args = digest.to_vec();
        args.extend(0u32.to_le_bytes());
        args.extend(admin.calc_script_hash().as_slice());
        args.extend(K.to_le_bytes());
        args.extend(guard.code_hash().as_slice());
        args.extend(admin.calc_script_hash().as_slice());
        args.extend(owner.calc_script_hash().as_slice());
        let ty = ctx
            .build_script_with_hash_type(&p, ScriptHashType::Data2, args.into())
            .unwrap();
        let guard = guard
            .as_builder()
            .args(ty.calc_script_hash().as_bytes().pack())
            .build();
        Self {
            ctx,
            ty,
            guard,
            admin,
            owner,
            seed,
        }
    }
    fn output(&self, cap: u64) -> CellOutput {
        CellOutput::new_builder()
            .capacity(cap)
            .lock(self.guard.clone())
            .type_(Some(self.ty.clone()).pack())
            .build()
    }
    fn plain(&self, cap: u64, owner: bool) -> CellOutput {
        CellOutput::new_builder()
            .capacity(cap)
            .lock(if owner {
                self.owner.clone()
            } else {
                self.admin.clone()
            })
            .build()
    }
    fn ticket(&self, outcome: u8, amount: u64) -> Vec<u8> {
        let mut d = self.owner.calc_script_hash().as_slice().to_vec();
        d.push(outcome);
        d.extend(amount.to_le_bytes());
        d
    }
    fn create(
        &mut self,
        name: &str,
        outputs: Vec<(Vec<u8>, u64)>,
        admin: bool,
        owner: bool,
        origin: bool,
        error: Option<i8>,
    ) {
        let mut inputs = vec![];
        if admin {
            inputs.push(
                CellInput::new_builder()
                    .previous_output(self.seed.clone())
                    .build(),
            );
        }
        if owner {
            let fund = self
                .ctx
                .create_cell(self.plain(100_000 * C, true), Bytes::new());
            inputs.push(CellInput::new_builder().previous_output(fund).build());
        }
        if !origin {
            inputs.reverse();
        }
        let mut cells = vec![];
        let mut data = vec![];
        for (bytes, capacity) in outputs {
            cells.push(self.output(capacity));
            data.push(Bytes::from(bytes).pack());
        }
        let tx = self.ctx.complete_tx(
            TransactionBuilder::default()
                .inputs(inputs)
                .outputs(cells)
                .outputs_data(data)
                .build(),
        );
        let result = self.ctx.verify_tx(&tx, 50_000_000);
        if let Some(code) = error {
            let msg = format!("{:?}", result.expect_err(name));
            assert!(msg.contains(&format!("error code {code}")), "{name}: {msg}");
            println!("PASS {name}: rejected {code}");
        } else {
            println!(
                "PASS {name}: {} cycles",
                result.unwrap_or_else(|e| panic!("{name}: {e:?}"))
            );
        }
    }
    fn check(
        &mut self,
        name: &str,
        inputs: Vec<(Vec<u8>, u64, u64)>,
        outputs: Vec<(Vec<u8>, u64)>,
        plain: Vec<(u64, bool)>,
        admin: bool,
        dep: bool,
        headers: bool,
        since: u64,
        error: Option<i8>,
    ) {
        let mut ins = vec![];
        let mut hs = vec![];
        for (d, cap, time) in inputs {
            let op = self.ctx.create_cell(self.output(cap), d.into());
            let h = HeaderBuilder::default()
                .timestamp(time)
                .number(10u64)
                .epoch(0x10000000001u64)
                .build();
            let hash = h.hash();
            self.ctx.insert_header(h);
            self.ctx.link_cell_with_block(op.clone(), hash.clone(), 1);
            hs.push(hash);
            ins.push(
                CellInput::new_builder()
                    .previous_output(op)
                    .since(if ins.is_empty() { since } else { 0 })
                    .build(),
            );
        }
        let fund = if admin {
            self.seed.clone()
        } else {
            self.ctx
                .create_cell(self.plain(100_000 * C, true), Bytes::new())
        };
        ins.push(CellInput::new_builder().previous_output(fund).build());
        let mut os = vec![];
        let mut ds = vec![];
        for (d, cap) in outputs {
            os.push(self.output(cap));
            ds.push(Bytes::from(d).pack());
        }
        for (cap, owner) in plain {
            os.push(self.plain(cap, owner));
            ds.push(Bytes::new().pack());
        }
        let mut tx = TransactionBuilder::default()
            .inputs(ins)
            .outputs(os)
            .outputs_data(ds);
        if headers {
            hs.sort();
            hs.dedup();
            tx = tx.header_deps(hs);
        }
        if dep {
            let m = self
                .ctx
                .create_cell(self.output(R), Bytes::from_static(&[0, 0, 255]));
            tx = tx.cell_dep(CellDep::new_builder().out_point(m).build());
        }
        let tx = self.ctx.complete_tx(tx.build());
        let result = self.ctx.verify_tx(&tx, 50_000_000);
        if let Some(code) = error {
            let msg = format!("{:?}", result.expect_err(name));
            assert!(msg.contains(&format!("error code {code}")), "{name}: {msg}");
            println!("PASS {name}: rejected {code}");
        } else {
            println!(
                "PASS {name}: {} cycles",
                result.unwrap_or_else(|e| panic!("{name}: {e:?}"))
            );
        }
    }
}
fn shard(id: u8, accepted: &[Vec<u8>], pending: Option<&Vec<u8>>) -> Vec<u8> {
    let mut d = vec![1, id, accepted.len() as u8, pending.is_some() as u8];
    for t in accepted {
        d.extend(t)
    }
    if let Some(t) = pending {
        d.extend(t)
    }
    d
}
fn pool(outcome: u8, totals: [u64; 3], mask: u64) -> Vec<u8> {
    let mut d = vec![2, outcome];
    for t in totals {
        d.extend(t.to_le_bytes())
    }
    d.extend(mask.to_le_bytes());
    d
}
fn receipt(id: u8, t: &[u8]) -> Vec<u8> {
    let mut d = vec![3, id];
    d.extend(t);
    d
}

#[test]
fn initialization() {
    for case in [
        "valid",
        "no-admin",
        "no-owner",
        "wrong-origin",
        "wrong-ticket-owner",
        "empty-first-shard",
        "accepted-first-ticket",
        "two-pending-tickets",
        "extra-ticket-bytes",
        "invalid-outcome",
        "below-minimum-principal",
        "capacity-overflow",
        "missing-shard",
        "duplicate-shard",
        "extra-shard",
        "other-shard-pending",
        "other-shard-accepted",
        "other-shard-underfunded",
        "first-shard-underfunded",
        "first-shard-overfunded",
        "control-underfunded",
        "pre-resolved",
    ] {
        let mut l = Lab::new();
        let ticket = l.ticket(0, 100 * C);
        let mut out = vec![
            (vec![0, 0, 255], R),
            (shard(0, &[], Some(&ticket)), R + S + 100 * C),
        ];
        out.extend((1..4).map(|id| (shard(id, &[], None), R)));
        let error = match case {
            "no-admin" | "no-owner" | "wrong-origin" => Some(6),
            "wrong-ticket-owner" => {
                out[1].0[4] ^= 1;
                Some(6)
            }
            "empty-first-shard" => {
                out[1] = (shard(0, &[], None), R);
                Some(8)
            }
            "accepted-first-ticket" => {
                out[1].0 = shard(0, &[ticket.clone()], None);
                Some(8)
            }
            "two-pending-tickets" => {
                out[1].0[3] = 2;
                out[1].0.extend(&ticket);
                Some(5)
            }
            "extra-ticket-bytes" => {
                out[1].0.push(0);
                Some(5)
            }
            "invalid-outcome" => {
                out[1].0[36] = 3;
                Some(9)
            }
            "below-minimum-principal" => {
                out[1].0 = shard(0, &[], Some(&l.ticket(0, 100 * C - 1)));
                Some(9)
            }
            "capacity-overflow" => {
                out[1] = (shard(0, &[], Some(&l.ticket(0, u64::MAX))), u64::MAX);
                Some(9)
            }
            "missing-shard" => {
                out.pop();
                Some(5)
            }
            "duplicate-shard" => {
                out[2].0[1] = 0;
                Some(5)
            }
            "extra-shard" => {
                out.push((shard(0, &[], None), R));
                Some(5)
            }
            "other-shard-pending" => {
                out[2] = (shard(1, &[], Some(&ticket)), R + S + 100 * C);
                Some(5)
            }
            "other-shard-accepted" => {
                out[2] = (shard(1, &[ticket.clone()], None), R + S + 100 * C);
                Some(5)
            }
            "other-shard-underfunded" => {
                out[3].1 -= 1;
                Some(5)
            }
            "first-shard-underfunded" => {
                out[1].1 -= 1;
                Some(9)
            }
            "first-shard-overfunded" => {
                out[1].1 += 1;
                Some(9)
            }
            "control-underfunded" => {
                out[0].1 -= 1;
                Some(5)
            }
            "pre-resolved" => {
                out[0].0[1] = 1;
                Some(5)
            }
            _ => None,
        };
        l.create(
            &format!("initialization/{case}"),
            out,
            case != "no-admin",
            case != "no-owner",
            case != "wrong-origin",
            error,
        );
    }
}
#[test]
fn first_ticket_creation_timestamp_controls_admission_and_refunds() {
    for created_at in [K - 1, K, K + 1] {
        let mut l = Lab::with_arg_lengths(22, 22);
        let first = l.ticket(0, 100 * C);
        let next = l.ticket(1, 200 * C);
        let initial_shard = shard(0, &[], Some(&first));
        let mut initial = vec![
            (vec![0, 0, 255], R),
            (initial_shard.clone(), R + S + 100 * C),
        ];
        initial.extend((1..4).map(|id| (shard(id, &[], None), R)));
        l.create(
            &format!("first-ticket/{created_at}/creation"),
            initial,
            true,
            true,
            true,
            None,
        );
        let timely = created_at < K;
        let admitted = if timely { vec![first.clone()] } else { vec![] };
        let replacement_capacity = R + S + 200 * C + if timely { S + 100 * C } else { 0 };
        let refund = if timely {
            vec![]
        } else {
            vec![(S + 100 * C, true)]
        };
        l.check(
            &format!("first-ticket/{created_at}/replacement"),
            vec![(initial_shard.clone(), R + S + 100 * C, created_at)],
            vec![(shard(0, &admitted, Some(&next)), replacement_capacity)],
            refund,
            false,
            true,
            true,
            0,
            None,
        );
        l.check(
            &format!("first-ticket/{created_at}/missing-creation-header"),
            vec![(initial_shard.clone(), R + S + 100 * C, created_at)],
            vec![(shard(0, &admitted, Some(&next)), replacement_capacity)],
            if timely {
                vec![]
            } else {
                vec![(S + 100 * C, true)]
            },
            false,
            true,
            false,
            0,
            Some(10),
        );
        for void in [false, true] {
            let outcome = if void { 255 } else { 0 };
            let control = if void { vec![0, 0, 255] } else { vec![0, 1, 0] };
            let mut inputs = vec![(control, R, K + 1_000)];
            inputs.push((initial_shard.clone(), R + S + 100 * C, created_at));
            inputs.extend((1..4).map(|id| (shard(id, &[], None), R, created_at)));
            let mut outputs = vec![(
                pool(outcome, [if timely { 100 * C } else { 0 }, 0, 0], 0),
                5 * R - if void { 100 * C } else { 0 },
            )];
            let mut plain = vec![];
            if timely {
                outputs.push((receipt(0, &first), S + 100 * C));
            } else {
                plain.push((S + 100 * C, true));
            }
            if void {
                plain.push((100 * C, false));
            }
            l.check(
                &format!("first-ticket/{created_at}/closure-void-{void}"),
                inputs,
                outputs,
                plain,
                false,
                false,
                true,
                if void {
                    0x4000000000000000 | ((K + 21_600_000) / 1000)
                } else {
                    0
                },
                None,
            );
        }
    }
}

#[test]
fn admission() {
    for case in [
        "first",
        "timely-pending",
        "late-refunded",
        "cutoff-equality",
        "missing-header",
        "missing-market",
        "changed-accepted",
        "unfunded",
        "wrong-owner",
        "late-stolen",
        "full",
    ] {
        let mut l = Lab::new();
        let t = l.ticket(0, 100 * C);
        let next = l.ticket(1, 200 * C);
        let first = case == "first";
        let late = ["late-refunded", "cutoff-equality", "late-stolen"].contains(&case);
        let accepted = if case == "full" {
            vec![t.clone(); 7]
        } else {
            vec![]
        };
        let mut after = accepted.clone();
        if !first && !late {
            after.push(t.clone());
        }
        let old = shard(0, &accepted, if first { None } else { Some(&t) });
        let oldcap = R + (accepted.len() as u64 + u64::from(!first)) * (S + 100 * C);
        let mut out = shard(0, &after, Some(&next));
        let mut cap = oldcap + S + 200 * C - if late { S + 100 * C } else { 0 };
        let mut plain = if late {
            vec![(S + 100 * C, true)]
        } else {
            vec![]
        };
        let error = match case {
            "missing-header" => Some(10),
            "missing-market" => Some(11),
            "changed-accepted" => {
                out[36] ^= 1;
                Some(8)
            }
            "unfunded" => {
                cap -= 1;
                Some(9)
            }
            "wrong-owner" => Some(6),
            "late-stolen" => {
                plain[0].1 = false;
                Some(6)
            }
            "full" => Some(8),
            _ => None,
        };
        l.check(
            &format!("admission/{case}"),
            vec![(old, oldcap, if late { K } else { K - 1 })],
            vec![(out, cap)],
            plain,
            case == "wrong-owner",
            case != "missing-market",
            case != "missing-header",
            0,
            error,
        );
    }
}
#[test]
fn reporting() {
    for case in [
        "admin",
        "unauthorized",
        "replace-result",
        "capacity-drain",
        "invalid-outcome",
    ] {
        let mut l = Lab::new();
        let mut old = vec![0, 0, 255];
        let mut out = vec![0, 1, 0];
        let mut cap = R;
        let error = match case {
            "unauthorized" => Some(6),
            "replace-result" => {
                old = vec![0, 1, 1];
                Some(8)
            }
            "capacity-drain" => {
                cap -= 1;
                Some(9)
            }
            "invalid-outcome" => {
                out[2] = 3;
                Some(8)
            }
            _ => None,
        };
        l.check(
            &format!("report/{case}"),
            vec![(old, R, K)],
            vec![(out, cap)],
            vec![],
            case != "unauthorized",
            false,
            false,
            0,
            error,
        );
    }
}
#[test]
fn closure() {
    for case in [
        "resolved",
        "void",
        "empty-winning-pool",
        "missing-shard",
        "duplicate-shard",
        "wrong-totals",
        "forged-share",
        "missing-share",
        "late-pending",
        "missing-header",
        "early-result",
        "late-result",
        "timely-result-after-deadline",
        "premature-timeout",
        "capacity-drain",
    ] {
        let mut l = Lab::new();
        let t = l.ticket(0, 100 * C);
        let late = case == "late-pending";
        let void = case == "void" || case == "premature-timeout";
        let empty = case == "empty-winning-pool";
        let mut ins = vec![(
            if void {
                vec![0, 0, 255]
            } else {
                vec![0, 1, if empty { 1 } else { 0 }]
            },
            R,
            if case == "early-result" {
                K - 1
            } else if case == "late-result" {
                K + 21_600_000
            } else {
                K
            },
        )];
        for i in 0..4 {
            ins.push((
                shard(i, &[], if i == 0 { Some(&t) } else { None }),
                R + if i == 0 { S + 100 * C } else { 0 },
                if late { K } else { K - 1 },
            ));
        }
        let totals = if late { [0, 0, 0] } else { [100 * C, 0, 0] };
        let outcome = if void {
            255
        } else if empty {
            1
        } else {
            0
        };
        let mask = 0;
        let mut out = vec![(
            pool(outcome, totals, mask),
            5 * R - if void { 100 * C } else { 0 },
        )];
        if !late {
            out.push((receipt(0, &t), S + 100 * C));
        }
        let mut plain = vec![];
        if late {
            plain.push((S + 100 * C, true));
        }
        if void {
            plain.push((100 * C, true));
        }
        let error = match case {
            "missing-shard" => {
                ins.pop();
                Some(5)
            }
            "duplicate-shard" => {
                ins[2].0[1] = 0;
                Some(8)
            }
            "wrong-totals" => {
                out[0].0[2] ^= 1;
                Some(8)
            }
            "forged-share" => {
                out[1].0[3] ^= 1;
                Some(9)
            }
            "missing-share" => {
                out.pop();
                Some(8)
            }
            "missing-header" => Some(10),
            "early-result" | "late-result" | "premature-timeout" => Some(7),
            "capacity-drain" => {
                out[0].1 -= 1;
                Some(9)
            }
            _ => None,
        };
        let since = if case == "void" || case == "timely-result-after-deadline" {
            0x4000000000000000 | ((K + 21_600_000) / 1000)
        } else {
            0
        };
        l.check(
            &format!("closure/{case}"),
            ins,
            out,
            plain,
            false,
            false,
            case != "missing-header",
            since,
            error,
        );
    }
}
#[test]
fn independent_claims() {
    for case in [
        "winner",
        "loser",
        "refund",
        "wrong-owner",
        "underpaid",
        "recreated-claim",
        "two-claims-one-payment",
    ] {
        let mut l = Lab::new();
        let t = l.ticket(0, 100 * C);
        let cap = if case == "loser" {
            S
        } else {
            S + 1485 * C / 10
        };
        let mut ins = vec![(receipt(0, &t), cap, K)];
        let mut out = vec![];
        let mut value = cap;
        let mut owner = true;
        let error = match case {
            "wrong-owner" => {
                owner = false;
                Some(6)
            }
            "underpaid" => {
                value -= 1;
                Some(9)
            }
            "recreated-claim" => {
                out.push((receipt(0, &t), cap));
                Some(5)
            }
            "two-claims-one-payment" => {
                ins.push((receipt(1, &t), cap, K));
                Some(5)
            }
            _ => None,
        };
        l.check(
            &format!("claim/{case}"),
            ins,
            out,
            vec![(value, owner)],
            false,
            false,
            false,
            0,
            error,
        );
    }
}
#[test]
fn reserve_is_separate_from_claims() {
    let mut l = Lab::new();
    l.check(
        "reserve/no-claim-dependency",
        vec![(pool(0, [400 * C, 200 * C, 0], 0), R, K)],
        vec![],
        vec![(R, false)],
        false,
        false,
        false,
        0,
        None,
    );
}

#[test]
fn maximum_market_and_fee_conservation() {
    for case in ["32-shares", "protocol-fee-underpaid", "creator-fee-stolen"] {
        let mut l = Lab::new();
        let ts: Vec<_> = (0..8).map(|i| l.ticket(i % 3, 100 * C)).collect();
        let mut ins = vec![(vec![0, 1, 0], R, K)];
        for id in 0..4 {
            ins.push((shard(id, &ts, None), R + 8 * (S + 100 * C), K - 1));
        }
        let mut out = vec![(
            pool(0, [1200 * C, 1200 * C, 800 * C], 0),
            5 * R - 200 * C + 8,
        )];
        for id in 0..32 {
            out.push((
                receipt(id, &ts[id as usize % 8]),
                S + if id % 8 % 3 == 0 {
                    100 * C + ((100 * C) as u128 * (1940 * C) as u128 / (1200 * C) as u128) as u64
                } else {
                    0
                },
            ));
        }
        let mut plain = vec![(140 * C, false), (120 * C, true)];
        let error = match case {
            "protocol-fee-underpaid" => {
                plain[0].0 -= 1;
                out[0].1 += 1;
                Some(9)
            }
            "creator-fee-stolen" => {
                plain[1].1 = false;
                Some(6)
            }
            _ => None,
        };
        l.check(
            &format!("maximum/{case}"),
            ins,
            out,
            plain,
            false,
            false,
            true,
            0,
            error,
        );
    }
}

#[test]
fn guard_rejects_type_removal() {
    let mut l = Lab::new();
    let op = l.ctx.create_cell(
        CellOutput::new_builder()
            .capacity(R)
            .lock(l.guard.clone())
            .build(),
        Bytes::new(),
    );
    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(op).build())
        .output(l.plain(R, true))
        .output_data(Bytes::new().pack())
        .build();
    let tx = l.ctx.complete_tx(tx);
    let message = format!(
        "{:?}",
        l.ctx.verify_tx(&tx, 50_000_000).expect_err("type stripped")
    );
    assert!(message.contains("error code 5"), "{message}");
    println!("PASS guard/type-removal: rejected 5");
}

#[test]
fn authorization_lock_argument_boundaries() {
    for length in [20, 22, 59, 60] {
        let expected = if length <= 59 { None } else { Some(6) };
        let mut admin = Lab::with_arg_lengths(length, 22);
        let first = admin.ticket(1, 100 * C);
        let mut creation = vec![
            (vec![0, 0, 255], R),
            (shard(0, &[], Some(&first)), R + S + 100 * C),
        ];
        creation.extend((1..4).map(|id| (shard(id, &[], None), R)));
        admin.create(
            &format!("lock-args/{length}/admin-create"),
            creation,
            true,
            true,
            true,
            expected,
        );
        admin.check(
            &format!("lock-args/{length}/admin-report"),
            vec![(vec![0, 0, 255], R, K)],
            vec![(vec![0, 1, 0], R)],
            vec![],
            true,
            false,
            false,
            0,
            expected,
        );
        let mut owner = Lab::with_arg_lengths(22, length);
        let ticket = owner.ticket(2, 100 * C);
        let mut creation = vec![
            (vec![0, 0, 255], R),
            (shard(0, &[], Some(&ticket)), R + S + 100 * C),
        ];
        creation.extend((1..4).map(|id| (shard(id, &[], None), R)));
        owner.create(
            &format!("lock-args/{length}/owner-create"),
            creation,
            true,
            true,
            true,
            expected,
        );
        owner.check(
            &format!("lock-args/{length}/owner-deposit"),
            vec![(shard(0, &[], None), R, K - 1)],
            vec![(shard(0, &[], Some(&ticket)), R + S + 100 * C)],
            vec![],
            false,
            true,
            true,
            0,
            expected,
        );
    }
}

#[test]
fn long_lock_lifecycle_and_pinned_owner_payments() {
    // These locks use ALWAYS_SUCCESS to isolate the protocol's lock-hash and
    // occupied-capacity rules. This is not an OmniLock signature verification test.
    for length in [22, 59] {
        let mut l = Lab::with_arg_lengths(length, length);
        let home = l.ticket(0, 100 * C);
        let draw = l.ticket(1, 200 * C);
        l.check(
            &format!("long-lock/{length}/wrong-deposit-owner"),
            vec![(shard(0, &[], None), R, K - 1)],
            vec![(shard(0, &[], Some(&home)), R + S + 100 * C)],
            vec![],
            true,
            true,
            true,
            0,
            Some(6),
        );
        l.check(
            &format!("long-lock/{length}/admit-prior-and-fund-next"),
            vec![(shard(0, &[], Some(&home)), R + S + 100 * C, K - 1)],
            vec![(shard(0, &[home.clone()], Some(&draw)), R + 2 * S + 300 * C)],
            vec![],
            false,
            true,
            true,
            0,
            None,
        );
        for redirected in [false, true] {
            l.check(
                &format!("long-lock/{length}/late-refund-redirected-{redirected}"),
                vec![(shard(0, &[], Some(&home)), R + S + 100 * C, K)],
                vec![(shard(0, &[], Some(&draw)), R + S + 200 * C)],
                vec![(S + 100 * C, !redirected)],
                false,
                true,
                true,
                0,
                if redirected { Some(6) } else { None },
            );
        }
        let mut inputs = vec![(vec![0, 1, 0], R, K)];
        inputs.push((
            shard(0, &[home.clone(), draw.clone()], None),
            R + 2 * S + 300 * C,
            K - 1,
        ));
        inputs.extend((1..4).map(|id| (shard(id, &[], None), R, K - 1)));
        l.check(
            &format!("long-lock/{length}/settlement-conserves-fees-and-claims"),
            inputs,
            vec![
                (pool(0, [100 * C, 200 * C, 0], 0), 5 * R - 200 * C),
                (receipt(0, &home), S + 294 * C),
                (receipt(1, &draw), S),
            ],
            vec![(104 * C, false), (102 * C, true)],
            false,
            false,
            true,
            0,
            None,
        );
        for (name, ticket, amount) in [
            ("winner", &home, S + 294 * C),
            ("loser", &draw, S),
            ("void-refund", &home, S + 100 * C),
        ] {
            for redirected in [false, true] {
                l.check(
                    &format!("long-lock/{length}/{name}-claim-redirected-{redirected}"),
                    vec![(receipt(0, ticket), amount, K)],
                    vec![],
                    vec![(amount, !redirected)],
                    false,
                    false,
                    false,
                    0,
                    if redirected { Some(6) } else { None },
                );
            }
        }
        let mut inputs = vec![(vec![0, 0, 255], R, K)];
        inputs.push((shard(0, &[], Some(&home)), R + S + 100 * C, K - 1));
        inputs.extend((1..4).map(|id| (shard(id, &[], None), R, K - 1)));
        l.check(
            &format!("long-lock/{length}/six-hour-void-and-keeper-capacity"),
            inputs,
            vec![
                (pool(255, [100 * C, 0, 0], 0), 5 * R - 100 * C),
                (receipt(0, &home), S + 100 * C),
            ],
            vec![(100 * C, true)],
            false,
            false,
            true,
            0x4000000000000000 | ((K + 21_600_000) / 1000),
            None,
        );
    }
}

#[test]
fn fixed_plain_payout_capacity_proves_59_byte_bound() {
    for length in [22, 59, 60] {
        let l = Lab::with_arg_lengths(length, length);
        for owner in [false, true] {
            let occupied = l
                .plain(100 * C, owner)
                .occupied_capacity(Capacity::bytes(0).unwrap())
                .unwrap()
                .as_u64();
            assert_eq!(occupied, (8 + 32 + 1 + length as u64) * C);
            assert_eq!(occupied <= 100 * C, length <= 59);
            if length <= 59 {
                assert!(
                    occupied <= S,
                    "The minimum losing claim must remain spendable"
                );
            }
        }
        println!("PASS lock-args/{length}/occupied-capacity-bound");
    }
}

fn batch_type(lab: &Lab, base: usize, existing: bool) -> (Script, Script) {
    let mut args = lab.ty.args().raw_data().to_vec();
    args[32..36].copy_from_slice(&(base as u32).to_le_bytes());
    if existing {
        args[0] ^= 0x80;
    }
    let ty = lab
        .ty
        .clone()
        .as_builder()
        .args(Bytes::from(args).pack())
        .build();
    let guard = lab
        .guard
        .clone()
        .as_builder()
        .args(ty.calc_script_hash().as_bytes().pack())
        .build();
    (ty, guard)
}
fn batch_output(group: &(Script, Script), capacity: u64) -> CellOutput {
    CellOutput::new_builder()
        .capacity(capacity)
        .type_(Some(group.0.clone()).pack())
        .lock(group.1.clone())
        .build()
}
fn batch_fixture(
    new_markets: usize,
    deposits: usize,
    late: bool,
) -> (Lab, ckb_testtool::ckb_types::core::TransactionView) {
    let mut lab = Lab::new();
    let owner_fund = lab
        .ctx
        .create_cell(lab.plain(100_000 * C, true), Bytes::new());
    let mut inputs = vec![
        CellInput::new_builder()
            .previous_output(lab.seed.clone())
            .build(),
        CellInput::new_builder().previous_output(owner_fund).build(),
    ];
    let mut outputs = vec![];
    let mut data = vec![];
    let mut deps = vec![];
    let mut headers = vec![];
    for index in 0..new_markets + deposits {
        let existing = index >= new_markets;
        let group = batch_type(&lab, outputs.len(), existing);
        let amount = (100 + index as u64) * C;
        let ticket = lab.ticket((index % 3) as u8, amount);
        if !existing {
            outputs.push(batch_output(&group, R));
            data.push(Bytes::from(vec![0, 0, 255]));
            outputs.push(batch_output(&group, R + S + amount));
            data.push(Bytes::from(shard(0, &[], Some(&ticket))));
            for shard_id in 1..4 {
                outputs.push(batch_output(&group, R));
                data.push(Bytes::from(shard(shard_id, &[], None)));
            }
        } else {
            let prior = lab.ticket(0, 100 * C);
            let point = lab.ctx.create_cell(
                batch_output(&group, R + S + 100 * C),
                shard(0, &[], Some(&prior)).into(),
            );
            let header = HeaderBuilder::default()
                .number(100 + index as u64)
                .timestamp(if late { K } else { K - 1 })
                .epoch(0x10000000001u64)
                .build();
            let hash = header.hash();
            lab.ctx.insert_header(header);
            lab.ctx.link_cell_with_block(point.clone(), hash.clone(), 1);
            headers.push(hash);
            inputs.push(CellInput::new_builder().previous_output(point).build());
            let control = lab
                .ctx
                .create_cell(batch_output(&group, R), vec![0, 0, 255].into());
            deps.push(CellDep::new_builder().out_point(control).build());
            let accepted = if late { vec![] } else { vec![prior] };
            outputs.push(batch_output(
                &group,
                R + S + amount + if late { 0 } else { S + 100 * C },
            ));
            data.push(Bytes::from(shard(0, &accepted, Some(&ticket))));
            if late {
                outputs.push(lab.plain(S + 100 * C, true));
                data.push(Bytes::new());
            }
        }
    }
    let tx = lab.ctx.complete_tx(
        TransactionBuilder::default()
            .inputs(inputs)
            .outputs(outputs)
            .set_outputs_data(data.into_iter().map(|d| d.pack()).collect())
            .cell_deps(deps)
            .header_deps(headers)
            .build(),
    );
    (lab, tx)
}
fn check_batch(
    lab: &Lab,
    name: &str,
    tx: &ckb_testtool::ckb_types::core::TransactionView,
    valid: bool,
) {
    let result = lab.ctx.verify_tx(tx, 100_000_000);
    if valid {
        println!(
            "PASS batch/{name}: {} cycles",
            result.unwrap_or_else(|error| panic!("{name}: {error:?}"))
        );
    } else {
        let message = format!("{:?}", result.expect_err(name));
        assert!(
            message.contains("error code"),
            "{name}: expected script rejection, got {message}"
        );
        println!("PASS batch/{name}: rejected {message}");
    }
}

#[test]
fn atomic_entry_batches_preserve_independent_markets() {
    for (name, creates, deposits, late) in [
        ("eight-creations", 8, 0, false),
        ("eight-funded-deposits", 0, 8, false),
        ("mixed-eight", 4, 4, false),
        ("mixed-eight-with-distinct-late-refunds", 4, 4, true),
        ("two-identical-owner-refunds", 0, 2, true),
    ] {
        let (lab, tx) = batch_fixture(creates, deposits, late);
        check_batch(&lab, name, &tx, true);
    }
    let (lab, tx) = batch_fixture(0, 8, false);
    let owner_only = tx
        .as_advanced_builder()
        .set_inputs(tx.inputs().into_iter().skip(1).collect())
        .build();
    check_batch(
        &lab,
        "funded-basket-needs-no-administrator-signature",
        &owner_only,
        true,
    );
}

#[test]
fn atomic_entry_batches_reject_ambiguous_accounting() {
    for case in [
        "ninth-market",
        "duplicate-market",
        "wrong-origin",
        "wrong-output-index",
        "noncontiguous-group",
        "missing-owner",
        "second-ticket-wrong-owner",
        "underfunded-control",
        "overfunded-ticket",
        "foreign-typed-input",
        "foreign-typed-output",
        "too-many-inputs",
        "too-many-outputs",
        "refund-alias",
        "refund-redirect",
    ] {
        let (mut lab, tx) = if case == "ninth-market" {
            batch_fixture(9, 0, false)
        } else if case.starts_with("refund-") {
            batch_fixture(0, 2, true)
        } else {
            batch_fixture(2, 0, false)
        };
        let mut outputs: Vec<CellOutput> = tx.outputs().into_iter().collect();
        let mut data: Vec<Bytes> = tx
            .outputs_data()
            .into_iter()
            .map(|d| d.raw_data())
            .collect();
        let mut inputs: Vec<CellInput> = tx.inputs().into_iter().collect();
        match case {
            "duplicate-market" => {
                let group = batch_type(&lab, 0, false);
                for output in &mut outputs[5..10] {
                    *output = output
                        .clone()
                        .as_builder()
                        .type_(Some(group.0.clone()).pack())
                        .lock(group.1.clone())
                        .build();
                }
            }
            "wrong-origin" | "wrong-output-index" => {
                let mut group = batch_type(&lab, 5, false);
                let mut args = group.0.args().raw_data().to_vec();
                if case == "wrong-origin" {
                    args[0] ^= 1;
                } else {
                    args[32..36].copy_from_slice(&6u32.to_le_bytes());
                }
                group.0 = group.0.as_builder().args(Bytes::from(args).pack()).build();
                group.1 = group
                    .1
                    .as_builder()
                    .args(group.0.calc_script_hash().as_bytes().pack())
                    .build();
                for output in &mut outputs[5..10] {
                    *output = output
                        .clone()
                        .as_builder()
                        .type_(Some(group.0.clone()).pack())
                        .lock(group.1.clone())
                        .build();
                }
            }
            "noncontiguous-group" => {
                outputs.swap(4, 5);
                data.swap(4, 5);
            }
            "missing-owner" => {
                inputs.remove(1);
            }
            "second-ticket-wrong-owner" => {
                let mut ticket_data = data[6].to_vec();
                ticket_data[4] ^= 1;
                data[6] = ticket_data.into();
            }
            "underfunded-control" => {
                outputs[5] = outputs[5].clone().as_builder().capacity(R - 1).build()
            }
            "overfunded-ticket" => {
                outputs[6] = outputs[6]
                    .clone()
                    .as_builder()
                    .capacity(R + S + 101 * C + 1)
                    .build()
            }
            "foreign-typed-output" => {
                outputs.push(
                    lab.plain(100 * C, true)
                        .as_builder()
                        .type_(Some(lab.owner.clone()).pack())
                        .build(),
                );
                data.push(Bytes::new());
            }
            "foreign-typed-input" => {
                let foreign = lab
                    .plain(100 * C, true)
                    .as_builder()
                    .type_(Some(lab.owner.clone()).pack())
                    .build();
                let point = lab.ctx.create_cell(foreign, Bytes::new());
                inputs.push(CellInput::new_builder().previous_output(point).build());
            }
            "too-many-inputs" => {
                while inputs.len() <= 64 {
                    let point = lab.ctx.create_cell(lab.plain(100 * C, true), Bytes::new());
                    inputs.push(CellInput::new_builder().previous_output(point).build());
                }
            }
            "too-many-outputs" => {
                while outputs.len() <= 64 {
                    outputs.push(lab.plain(100 * C, true));
                    data.push(Bytes::new());
                }
            }
            "refund-alias" => {
                outputs.remove(3);
                data.remove(3);
            }
            "refund-redirect" => {
                outputs[1] = outputs[1]
                    .clone()
                    .as_builder()
                    .lock(lab.admin.clone())
                    .build()
            }
            _ => (),
        }
        let changed = lab.ctx.complete_tx(
            tx.as_advanced_builder()
                .set_inputs(inputs)
                .set_outputs(outputs)
                .set_outputs_data(data.into_iter().map(|d| d.pack()).collect())
                .build(),
        );
        check_batch(&lab, case, &changed, false);
    }
}

#[test]
fn payouts_and_nonentry_transitions_require_typed_isolation() {
    for case in [
        "claim-with-foreign-input",
        "claim-with-foreign-output",
        "two-claims-cannot-share-payment",
        "entry-plus-claim",
        "entry-plus-report",
    ] {
        let (mut lab, tx) = batch_fixture(0, 1, false);
        let group = batch_type(&lab, 60, true);
        let ticket = lab.ticket(0, 100 * C);
        let mut inputs: Vec<CellInput> = if case.starts_with("entry-") {
            tx.inputs().into_iter().collect()
        } else {
            vec![]
        };
        let mut outputs: Vec<CellOutput> = if case.starts_with("entry-") {
            tx.outputs().into_iter().collect()
        } else {
            vec![]
        };
        let mut data: Vec<Bytes> = if case.starts_with("entry-") {
            tx.outputs_data()
                .into_iter()
                .map(|d| d.raw_data())
                .collect()
        } else {
            vec![]
        };
        let report = case == "entry-plus-report";
        let point = lab.ctx.create_cell(
            batch_output(&group, if report { R } else { S }),
            if report {
                vec![0, 0, 255]
            } else {
                receipt(0, &ticket)
            }
            .into(),
        );
        inputs.push(CellInput::new_builder().previous_output(point).build());
        if report {
            outputs.push(batch_output(&group, R));
            data.push(vec![0, 1, 0].into());
        } else {
            outputs.push(lab.plain(S, true));
            data.push(Bytes::new());
        }
        if case == "claim-with-foreign-input" || case == "two-claims-cannot-share-payment" {
            let foreign = if case == "two-claims-cannot-share-payment" {
                batch_output(&batch_type(&lab, 61, true), S)
            } else {
                lab.plain(S, true)
                    .as_builder()
                    .type_(Some(lab.owner.clone()).pack())
                    .build()
            };
            let point = lab.ctx.create_cell(
                foreign,
                if case == "two-claims-cannot-share-payment" {
                    receipt(0, &ticket).into()
                } else {
                    Bytes::new()
                },
            );
            inputs.push(CellInput::new_builder().previous_output(point).build());
        }
        if case == "claim-with-foreign-output" {
            outputs[0] = outputs[0]
                .clone()
                .as_builder()
                .type_(Some(lab.owner.clone()).pack())
                .build();
        }
        let changed = lab.ctx.complete_tx(
            tx.as_advanced_builder()
                .set_inputs(inputs)
                .set_outputs(outputs)
                .set_outputs_data(data.into_iter().map(|d| d.pack()).collect())
                .build(),
        );
        check_batch(&lab, case, &changed, false);
    }
}
