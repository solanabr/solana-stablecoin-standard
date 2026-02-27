/// SSS Token Program - Instruction-Level Fuzz Tests
///
/// Trident-style instruction fuzzing scaffolding that defines `FuzzInstruction`
/// variants matching all 14 sss-token instructions. Each variant includes
/// invariant checks for supply consistency, role enforcement, pause enforcement,
/// and minter quota limits.

pub mod test_instruction_fuzz;
