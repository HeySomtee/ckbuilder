use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{HeaderBuilder, ScriptHashType, TransactionBuilder, TransactionView},
    packed::*,
    prelude::*,
};
use ckb_testtool::{builtin::ALWAYS_SUCCESS, context::Context};
use std::{fs, path::Path};

const CKB: u64 = 100_000_000;
const KICKOFF: u64 = 1_800_000_000_000;
const DEADLINE: u64 = KICKOFF + 21_600_000;
const BOUNTY: u64 = 100 * CKB;
const CAP: u64 = 800 * CKB;
fn since() -> u64 {
    0x4000_0000_0000_0000 | DEADLINE.div_ceil(1000)
}

struct Lab {
    ctx: Context,
    protocol: OutPoint,
    guard: OutPoint,
    admin: Script,
    owner: Script,
    stranger: Script,
}
impl Lab {
    fn new() -> Self {
        let mut ctx = Context::default();
        let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../target/riscv64imac-unknown-none-elf/release");
        let protocol = ctx.deploy_cell(fs::read(directory.join("streak-protocol")).unwrap().into());
        let guard = ctx.deploy_cell(fs::read(directory.join("streak-guard")).unwrap().into());
        let success = ctx.deploy_cell(ALWAYS_SUCCESS.clone());
        let admin = ctx
            .build_script(&success, Bytes::from_static(b"admin"))
            .unwrap();
        let owner = ctx
            .build_script(&success, Bytes::from_static(b"owner"))
            .unwrap();
        let stranger = ctx
            .build_script(&success, Bytes::from_static(b"stranger"))
            .unwrap();
        Self {
            ctx,
            protocol,
            guard,
            admin,
            owner,
            stranger,
        }
    }
    fn funding(&mut self, lock: Script) -> OutPoint {
        self.ctx.create_cell(
            CellOutput::new_builder()
                .capacity(10_000 * CKB)
                .lock(lock)
                .build(),
            Bytes::new(),
        )
    }
    fn ty(&mut self, args: Vec<u8>) -> Script {
        self.ctx
            .build_script_with_hash_type(&self.protocol, ScriptHashType::Data2, args.into())
            .unwrap()
    }
    fn guard_code(&mut self) -> Byte32 {
        self.ctx
            .build_script_with_hash_type(&self.guard, ScriptHashType::Data2, Bytes::new())
            .unwrap()
            .code_hash()
    }
    fn market(&mut self, seed: &OutPoint) -> Script {
        let mut args = vec![0];
        args.extend_from_slice(seed.as_slice());
        args.extend_from_slice(self.admin.calc_script_hash().as_slice());
        args.extend_from_slice(&KICKOFF.to_le_bytes());
        args.extend_from_slice(&DEADLINE.to_le_bytes());
        args.extend_from_slice(&BOUNTY.to_le_bytes());
        args.extend_from_slice(self.guard_code().as_slice());
        self.ty(args)
    }
    fn stake(&mut self, seed: &OutPoint, market: &Script) -> Script {
        let mut args = vec![1];
        args.extend_from_slice(seed.as_slice());
        args.extend_from_slice(market.calc_script_hash().as_slice());
        args.extend_from_slice(self.owner.calc_script_hash().as_slice());
        args.extend_from_slice(&KICKOFF.to_le_bytes());
        args.extend_from_slice(self.guard_code().as_slice());
        self.ty(args)
    }
    fn output(&mut self, ty: &Script, cap: u64) -> CellOutput {
        let lock = self
            .ctx
            .build_script_with_hash_type(
                &self.guard,
                ScriptHashType::Data2,
                ty.calc_script_hash().as_bytes(),
            )
            .unwrap();
        CellOutput::new_builder()
            .capacity(cap)
            .lock(lock)
            .type_(Some(ty.clone()).pack())
            .build()
    }
    fn cell(&mut self, ty: &Script, state: &[u8], time: u64) -> (OutPoint, Byte32) {
        let output = self.output(ty, CAP);
        let outpoint = self.ctx.create_cell(output, Bytes::copy_from_slice(state));
        let header = HeaderBuilder::default()
            .timestamp(time)
            .number(10u64)
            .epoch(0x10000000001u64)
            .build();
        let hash = header.hash();
        self.ctx.insert_header(header);
        self.ctx
            .link_cell_with_block(outpoint.clone(), hash.clone(), 1);
        (outpoint, hash)
    }
    fn dep(out: OutPoint) -> CellDep {
        CellDep::new_builder().out_point(out).dep_type(0u8).build()
    }
    fn input(out: OutPoint, since: u64) -> CellInput {
        CellInput::new_builder()
            .previous_output(out)
            .since(since)
            .build()
    }
    fn plain(&self, cap: u64, lock: Script) -> CellOutput {
        CellOutput::new_builder().capacity(cap).lock(lock).build()
    }
    fn check(&mut self, name: &str, tx: TransactionView, error: Option<i8>) {
        let tx = self.ctx.complete_tx(tx);
        let result = self.ctx.verify_tx(&tx, 20_000_000);
        match error {
            None => println!(
                "PASS {name}: {} cycles",
                result.unwrap_or_else(|e| panic!("{name}: {e:?}"))
            ),
            Some(code) => {
                let message = format!("{:?}", result.expect_err(name));
                assert!(
                    message.contains(&format!("error code {code}")),
                    "{name}: {message}"
                );
                println!("PASS {name}: rejected with code {code}");
            }
        }
    }
}
fn stake_data(phase: u8) -> Vec<u8> {
    let mut d = vec![phase, 0];
    d.extend_from_slice(&(100 * CKB).to_le_bytes());
    d
}

#[test]
fn creation_requires_admin_and_unique_seed() {
    for scenario in [
        "valid",
        "wrong-admin",
        "wrong-seed",
        "mint-resolved",
        "wrong-guard",
    ] {
        let mut l = Lab::new();
        let auth = if scenario == "wrong-admin" {
            l.stranger.clone()
        } else {
            l.admin.clone()
        };
        let seed = l.funding(auth);
        let ty = l.market(&seed);
        let input = if scenario == "wrong-seed" {
            l.funding(l.admin.clone())
        } else {
            seed
        };
        let mut output = l.output(&ty, CAP);
        if scenario == "wrong-guard" {
            output = output.as_builder().lock(l.owner.clone()).build();
        }
        let state = if scenario == "mint-resolved" {
            vec![2, 0]
        } else {
            vec![0, 255]
        };
        let tx = TransactionBuilder::default()
            .input(Lab::input(input, 0))
            .output(output)
            .output_data(Bytes::from(state).pack())
            .build();
        let code = match scenario {
            "valid" => None,
            "wrong-admin" => Some(6),
            "mint-resolved" => Some(8),
            _ => Some(5),
        };
        l.check(scenario, tx, code);
    }
}

#[test]
fn stake_creation_checks_owner_market_and_backing() {
    for scenario in [
        "valid",
        "wrong-owner",
        "no-market",
        "closed-market",
        "mint-accepted",
        "unbacked",
    ] {
        let mut l = Lab::new();
        let mseed = l.funding(l.admin.clone());
        let market = l.market(&mseed);
        let state = if scenario == "closed-market" {
            [1, 0]
        } else {
            [0, 255]
        };
        let (m, _) = l.cell(&market, &state, KICKOFF - 1000);
        let auth = if scenario == "wrong-owner" {
            l.stranger.clone()
        } else {
            l.owner.clone()
        };
        let seed = l.funding(auth);
        let ty = l.stake(&seed, &market);
        let mut d = stake_data(if scenario == "mint-accepted" { 1 } else { 0 });
        if scenario == "unbacked" {
            d[2..].copy_from_slice(&CAP.to_le_bytes());
        }
        let output = l.output(&ty, CAP);
        let mut builder = TransactionBuilder::default()
            .input(Lab::input(seed, 0))
            .output(output)
            .output_data(Bytes::from(d).pack());
        if scenario != "no-market" {
            builder = builder.cell_dep(Lab::dep(m));
        }
        let code = match scenario {
            "valid" => None,
            "wrong-owner" => Some(6),
            "mint-accepted" => Some(8),
            "unbacked" => Some(9),
            _ => Some(11),
        };
        l.check(scenario, builder.build(), code);
    }
}

#[test]
fn stake_admission_uses_creation_header_not_since() {
    for scenario in [
        "before",
        "exact",
        "after",
        "missing-header",
        "unrelated-header",
        "change-outcome",
        "remove-capacity",
        "repeat",
    ] {
        let mut l = Lab::new();
        let seed = l.funding(l.owner.clone());
        let market = l.market(&seed);
        let ty = l.stake(&seed, &market);
        let (m, _) = l.cell(&market, &[0, 255], KICKOFF - 2000);
        let timestamp = match scenario {
            "exact" => KICKOFF,
            "after" | "unrelated-header" => KICKOFF + 1,
            _ => KICKOFF - 1,
        };
        let d = stake_data(if scenario == "repeat" { 1 } else { 0 });
        let (s, header) = l.cell(&ty, &d, timestamp);
        let mut next = stake_data(1);
        if scenario == "change-outcome" {
            next[1] = 2;
        }
        let out = l.output(
            &ty,
            if scenario == "remove-capacity" {
                CAP - 1
            } else {
                CAP
            },
        );
        let mut builder = TransactionBuilder::default()
            .input(Lab::input(s, 0))
            .cell_dep(Lab::dep(m))
            .output(out)
            .output_data(Bytes::from(next).pack());
        if scenario == "unrelated-header" {
            let old = HeaderBuilder::default()
                .timestamp(KICKOFF - 1)
                .number(1u64)
                .epoch(0x10000000001u64)
                .build();
            builder = builder.header_dep(old.hash());
            l.ctx.insert_header(old);
        } else if scenario != "missing-header" {
            builder = builder.header_dep(header);
        }
        let code = match scenario {
            "before" => None,
            "exact" | "after" => Some(7),
            "missing-header" | "unrelated-header" => Some(10),
            "remove-capacity" => Some(9),
            _ => Some(8),
        };
        l.check(scenario, builder.build(), code);
    }
}

#[test]
fn pending_result_checks_authority_and_cannot_change_terms() {
    for authorized in [true, false] {
        let mut l = Lab::new();
        let seed = l.funding(l.admin.clone());
        let ty = l.market(&seed);
        let (m, _) = l.cell(&ty, &[0, 255], KICKOFF);
        let auth = if authorized {
            l.admin.clone()
        } else {
            l.stranger.clone()
        };
        let fee = l.funding(auth);
        let out = l.output(&ty, CAP);
        let tx = TransactionBuilder::default()
            .input(Lab::input(m, 0))
            .input(Lab::input(fee, 0))
            .output(out)
            .output_data(Bytes::from(vec![1, 2]).pack())
            .build();
        l.check("submit-result", tx, if authorized { None } else { Some(6) });
    }
}

#[test]
fn result_acceptance_rejects_late_and_changed_results() {
    for scenario in [
        "timely",
        "exact",
        "late",
        "early",
        "missing-header",
        "changed-outcome",
        "redirect-bond",
        "repeat-finalization",
    ] {
        let mut l = Lab::new();
        let seed = l.funding(l.admin.clone());
        let ty = l.market(&seed);
        let time = match scenario {
            "exact" => DEADLINE,
            "late" => DEADLINE + 1,
            "early" => KICKOFF - 1,
            _ => DEADLINE - 1,
        };
        let (m, header) = l.cell(
            &ty,
            &[
                if scenario == "repeat-finalization" {
                    2
                } else {
                    1
                },
                1,
            ],
            time,
        );
        let out = l.output(&ty, CAP - BOUNTY);
        let recipient = if scenario == "redirect-bond" {
            l.stranger.clone()
        } else {
            l.admin.clone()
        };
        let mut tx = TransactionBuilder::default()
            .input(Lab::input(m, 0))
            .output(out)
            .output_data(
                Bytes::from(vec![2, if scenario == "changed-outcome" { 0 } else { 1 }]).pack(),
            )
            .output(l.plain(BOUNTY, recipient))
            .output_data(Bytes::new().pack());
        if scenario != "missing-header" {
            tx = tx.header_dep(header);
        }
        let code = match scenario {
            "timely" => None,
            "exact" | "late" | "early" => Some(7),
            "missing-header" => Some(10),
            "redirect-bond" => Some(9),
            _ => Some(8),
        };
        l.check(scenario, tx.build(), code);
    }
}

#[test]
fn timeout_checks_since_and_preserves_timely_results() {
    for scenario in [
        "open",
        "late-pending",
        "early-pending",
        "timely-pending",
        "resolved",
        "already-void",
        "early-since",
        "relative-since",
        "wrong-metric",
        "missing-reward",
        "steal-reserve",
    ] {
        let mut l = Lab::new();
        let seed = l.funding(l.admin.clone());
        let ty = l.market(&seed);
        let (phase, outcome, time) = match scenario {
            "late-pending" => (1, 0, DEADLINE),
            "early-pending" => (1, 0, KICKOFF - 1),
            "timely-pending" => (1, 0, DEADLINE - 1),
            "resolved" => (2, 0, DEADLINE - 1),
            "already-void" => (3, 255, DEADLINE),
            _ => (0, 255, KICKOFF),
        };
        let (m, header) = l.cell(&ty, &[phase, outcome], time);
        let lower = match scenario {
            "early-since" => since() - 1,
            "relative-since" => since() | 0x8000_0000_0000_0000,
            "wrong-metric" => DEADLINE / 1000,
            _ => since(),
        };
        let out = l.output(
            &ty,
            if scenario == "steal-reserve" {
                CAP - BOUNTY - 1
            } else {
                CAP - BOUNTY
            },
        );
        let reward = if scenario == "missing-reward" {
            BOUNTY - 1
        } else {
            BOUNTY
        };
        let tx = TransactionBuilder::default()
            .input(Lab::input(m, lower))
            .header_dep(header)
            .output(out)
            .output_data(Bytes::from(vec![3, 255]).pack())
            .output(l.plain(reward, l.stranger.clone()))
            .output_data(Bytes::new().pack())
            .build();
        let code = match scenario {
            "open" | "late-pending" | "early-pending" => None,
            "resolved" | "already-void" => Some(8),
            "missing-reward" | "steal-reserve" => Some(9),
            _ => Some(7),
        };
        l.check(scenario, tx, code);
    }
}

#[test]
fn refunds_preserve_owner_principal_and_storage() {
    for scenario in [
        "late",
        "pending-void",
        "accepted-void",
        "accepted-live",
        "wrong-owner",
        "redirect",
        "skim",
        "timely-open",
    ] {
        let mut l = Lab::new();
        let seed = l.funding(l.owner.clone());
        let market = l.market(&seed);
        let ty = l.stake(&seed, &market);
        let accepted = scenario.starts_with("accepted");
        let is_void = scenario.ends_with("void");
        let time = if scenario == "late"
            || scenario == "wrong-owner"
            || scenario == "redirect"
            || scenario == "skim"
        {
            KICKOFF
        } else {
            KICKOFF - 1
        };
        let (s, h) = l.cell(&ty, &stake_data(if accepted { 1 } else { 0 }), time);
        let (m, _) = l.cell(
            &market,
            if is_void { &[3, 255] } else { &[0, 255] },
            KICKOFF,
        );
        let auth = if scenario == "wrong-owner" {
            l.stranger.clone()
        } else {
            l.owner.clone()
        };
        let fee = l.funding(auth);
        let recipient = if scenario == "redirect" {
            l.stranger.clone()
        } else {
            l.owner.clone()
        };
        let out = l.plain(if scenario == "skim" { CAP - 1 } else { CAP }, recipient);
        let tx = TransactionBuilder::default()
            .input(Lab::input(s, 0))
            .input(Lab::input(fee, 0))
            .header_dep(h)
            .cell_dep(Lab::dep(m))
            .output(out)
            .output_data(Bytes::new().pack())
            .build();
        let code = match scenario {
            "late" | "pending-void" | "accepted-void" => None,
            "wrong-owner" => Some(6),
            "redirect" | "skim" => Some(9),
            _ => Some(11),
        };
        l.check(scenario, tx, code);
    }
}

#[test]
fn guard_rejects_removing_the_type_script() {
    let mut l = Lab::new();
    let seed = l.funding(l.owner.clone());
    let ty = l.market(&seed);
    let mut input = l.output(&ty, CAP);
    input = input.as_builder().type_(ScriptOpt::default()).build();
    let cell = l.ctx.create_cell(input, Bytes::new());
    let tx = TransactionBuilder::default()
        .input(Lab::input(cell, 0))
        .output(l.plain(CAP, l.stranger.clone()))
        .output_data(Bytes::new().pack())
        .build();
    l.check("guard-requires-type", tx, Some(5));
}

#[test]
fn two_stakes_cannot_count_the_same_refund_output() {
    let mut l = Lab::new();
    let seed = l.funding(l.owner.clone());
    let market = l.market(&seed);
    let first = l.stake(&seed, &market);
    let other_seed = l.funding(l.owner.clone());
    let second = l.stake(&other_seed, &market);
    let (a, header) = l.cell(&first, &stake_data(0), KICKOFF);
    let (b, _) = l.cell(&second, &stake_data(0), KICKOFF);
    let auth = l.funding(l.owner.clone());
    let tx = TransactionBuilder::default()
        .input(Lab::input(a, 0))
        .input(Lab::input(b, 0))
        .input(Lab::input(auth, 0))
        .header_dep(header)
        .output(l.plain(CAP, l.owner.clone()))
        .output_data(Bytes::new().pack())
        .build();
    l.check("shared-refund-output", tx, Some(5));
}

#[test]
fn creation_rejects_malformed_or_overflowing_terms() {
    for scenario in [
        "short-args",
        "wrong-kind",
        "deadline-mismatch",
        "overflow",
        "zero-bounty",
        "unfunded-reward",
        "dust-reward",
    ] {
        let mut l = Lab::new();
        let seed = l.funding(l.admin.clone());
        let base = l.market(&seed);
        let mut args = base.args().raw_data().to_vec();
        match scenario {
            "short-args" => {
                args.pop();
            }
            "wrong-kind" => args[0] = 9,
            "deadline-mismatch" => args[77..85].copy_from_slice(&(DEADLINE + 1).to_le_bytes()),
            "overflow" => args[69..77].copy_from_slice(&u64::MAX.to_le_bytes()),
            "zero-bounty" => args[85..93].copy_from_slice(&0u64.to_le_bytes()),
            "unfunded-reward" => args[85..93].copy_from_slice(&(CAP - 1).to_le_bytes()),
            "dust-reward" => args[85..93].copy_from_slice(&1u64.to_le_bytes()),
            _ => unreachable!(),
        }
        let ty = l.ty(args);
        let output = l.output(&ty, CAP);
        let tx = TransactionBuilder::default()
            .input(Lab::input(seed, 0))
            .output(output)
            .output_data(Bytes::from(vec![0, 255]).pack())
            .build();
        l.check(
            scenario,
            tx,
            Some(if scenario.ends_with("reward") { 9 } else { 5 }),
        );
    }
}
