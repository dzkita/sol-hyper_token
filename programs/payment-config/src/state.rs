use anchor_lang::prelude::*;

#[account]
pub struct ProgramConfig{
    pub admin:Pubkey,
    pub fee_destination:Pubkey,
    pub fee_basis_points:u64
}
impl ProgramConfig{
    pub const LEN :usize = 8+32+32+8;
}