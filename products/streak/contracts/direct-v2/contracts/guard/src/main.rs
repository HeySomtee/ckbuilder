#![no_std]
#![no_main]

use ckb_std::{ckb_constants::Source, error::SysError, high_level::*};
ckb_std::entry!(main);
ckb_std::default_alloc!();

// Permissionless spending is safe only when the pinned type script validates it.
// An untyped input or a substituted type is never allowed through this lock.
pub fn main() -> i8 {
    let Ok(script) = load_script() else { return 5 };
    let args = script.args().raw_data();
    if args.len() != 32 {
        return 5;
    }
    for i in 0.. {
        match load_cell_type_hash(i, Source::GroupInput) {
            Ok(Some(hash)) if hash.as_slice() == args.as_ref() => (),
            Err(SysError::IndexOutOfBound) => return 0,
            _ => return 5,
        }
    }
    5
}
