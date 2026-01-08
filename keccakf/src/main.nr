use std::hash::keccakf1600;

fn main(input: [u64; 25], output: pub [u64; 25]) {
    assert(output == keccakf1600(input));
}
