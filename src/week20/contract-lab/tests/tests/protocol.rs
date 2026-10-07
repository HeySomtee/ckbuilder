use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{HeaderBuilder, ScriptHashType, TransactionBuilder},
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
        let mut ctx = Context::default();
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../target/riscv64imac-unknown-none-elf/release");
        let p = ctx.deploy_cell(fs::read(root.join("streak-protocol")).unwrap().into());
        let g = ctx.deploy_cell(fs::read(root.join("streak-guard")).unwrap().into());
        let s = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let admin = ctx.build_script(&s, Bytes::from_static(b"admin")).unwrap();
        let owner = ctx.build_script(&s, Bytes::from_static(b"owner")).unwrap();
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
        let mut args = seed.as_slice().to_vec();
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
        "unauthorized",
        "missing-shard",
        "duplicate-shard",
        "underfunded",
        "pre-resolved",
    ] {
        let mut l = Lab::new();
        let mut out = vec![(vec![0, 0, 255], R)];
        for i in 0..4 {
            out.push((shard(i, &[], None), R));
        }
        let error = match case {
            "unauthorized" => Some(6),
            "missing-shard" => {
                out.pop();
                Some(5)
            }
            "duplicate-shard" => {
                out[2].0[1] = 0;
                Some(5)
            }
            "underfunded" => {
                out[3].1 -= 1;
                Some(5)
            }
            "pre-resolved" => {
                out[0].0[1] = 1;
                Some(5)
            }
            _ => None,
        };
        l.check(
            &format!("initialization/{case}"),
            vec![],
            out,
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
