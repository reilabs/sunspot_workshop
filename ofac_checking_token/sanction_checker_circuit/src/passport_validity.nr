use sha256::sha256_var;
use utils::check_zero_padding;

pub global SIGNED_ATTRIBUTES_MAX_SIZE: u32 = 200;
pub global DSC_CERT_MAX_SIZE: u32 = 1300;
pub global DSC_SIGNATURE_SIZE: u32 = 256;
pub global CSC_PUBKEY_SIZE: u32 = 512;

pub struct PassportValidityContents {
    pub signed_attributes: [u8; SIGNED_ATTRIBUTES_MAX_SIZE],
    pub signed_attributes_size: u64,
    pub dsc_signature: [u8; DSC_SIGNATURE_SIZE],

    pub dsc_rsa_exponent: u32,
    pub dsc_pubkey: [u8; DSC_SIGNATURE_SIZE],
    pub dsc_barrett_mu: [u8; DSC_SIGNATURE_SIZE + 1],

    pub dsc_cert: [u8; DSC_CERT_MAX_SIZE],
    pub dsc_cert_len: u32,

    pub csc_pubkey: [u8; CSC_PUBKEY_SIZE],
    pub csc_barrett_mu: [u8; CSC_PUBKEY_SIZE + 1],
    pub dsc_cert_signature: [u8; CSC_PUBKEY_SIZE],
    pub csc_rsa_exponent: u32,

    pub econtent: [u8; SIGNED_ATTRIBUTES_MAX_SIZE],
    pub econtent_len: u32,
    pub dg1_hash_offset: u32,
    pub econtent_hash_offset: u32,
}

pub fn check_integrity_of_sod_within_sod_cert(
    signed_attributes: [u8; SIGNED_ATTRIBUTES_MAX_SIZE],
    signed_attributes_size: u32,
    econtent: [u8; SIGNED_ATTRIBUTES_MAX_SIZE],
    econtent_len: u32,
    econtent_hash_offset: u32,
) {
    check_zero_padding(signed_attributes, signed_attributes_size);

    let econtent_hash = sha256_var(econtent, econtent_len);

    for i in 0..32 {
        assert(econtent_hash[i] == signed_attributes[econtent_hash_offset + i]);
    }
}
