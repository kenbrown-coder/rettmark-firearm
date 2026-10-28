use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{bail, Context, Result};
use argon2::{Argon2, ParamsBuilder};
use rand::RngExt;
use std::fs;
use std::path::Path;

/// File format: magic(8) | salt(16) | nonce(12) | ciphertext
const MAGIC: &[u8; 8] = b"RFBK1AES";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;

pub fn encrypt_file_to(src: &Path, dest: &Path, passphrase: &str) -> Result<u64> {
    if passphrase.trim().len() < 8 {
        bail!("Backup passphrase must be at least 8 characters");
    }
    let plaintext = fs::read(src).context("read database for backup")?;
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    {
        let mut rng = rand::rng();
        rng.fill(&mut salt);
        rng.fill(&mut nonce_bytes);
    }

    let key_bytes = derive_key(passphrase.as_bytes(), &salt)?;
    let key = Key::<Aes256Gcm>::from(key_bytes);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_ref())
        .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut out = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    fs::write(dest, &out).context("write encrypted backup")?;
    Ok(out.len() as u64)
}

pub fn decrypt_file_to(src: &Path, dest: &Path, passphrase: &str) -> Result<()> {
    let data = fs::read(src).context("read encrypted backup")?;
    if data.len() < MAGIC.len() + SALT_LEN + NONCE_LEN + 16 {
        bail!("Backup file too short or corrupt");
    }
    if &data[0..8] != MAGIC {
        bail!("Not a Rettmark encrypted backup (bad magic)");
    }
    let salt = &data[8..8 + SALT_LEN];
    let nonce_bytes: [u8; NONCE_LEN] = data[8 + SALT_LEN..8 + SALT_LEN + NONCE_LEN]
        .try_into()
        .map_err(|_| anyhow::anyhow!("bad nonce"))?;
    let ciphertext = &data[8 + SALT_LEN + NONCE_LEN..];

    let key_bytes = derive_key(passphrase.as_bytes(), salt)?;
    let key = Key::<Aes256Gcm>::from(key_bytes);
    let cipher = Aes256Gcm::new(&key);
    let nonce = Nonce::from(nonce_bytes);
    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|_| anyhow::anyhow!("Decryption failed — wrong passphrase or corrupt file"))?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(dest, plaintext)?;
    Ok(())
}

pub fn looks_like_sqlite(path: &Path) -> Result<bool> {
    let mut header = [0u8; 16];
    let mut f = fs::File::open(path).context("open candidate sqlite")?;
    use std::io::Read;
    let n = f.read(&mut header)?;
    if n < 16 {
        return Ok(false);
    }
    Ok(&header[..15] == b"SQLite format 3")
}

fn derive_key(passphrase: &[u8], salt: &[u8]) -> Result<[u8; 32]> {
    let params = ParamsBuilder::new()
        .m_cost(19_456)
        .t_cost(2)
        .p_cost(1)
        .output_len(32)
        .build()
        .map_err(|e| anyhow::anyhow!("argon2 params: {e}"))?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase, salt, &mut key)
        .map_err(|e| anyhow::anyhow!("argon2 derive: {e}"))?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir();
        let src = dir.join(format!("rfbk-src-{nanos}.bin"));
        let enc = dir.join(format!("rfbk-enc-{nanos}.rfbk"));
        let out = dir.join(format!("rfbk-out-{nanos}.bin"));
        // Minimal SQLite header so restore validation helpers can recognize the payload
        let mut bytes = b"SQLite format 3\0".to_vec();
        bytes.extend_from_slice(b"rettmark-payload");
        std::fs::write(&src, &bytes).unwrap();
        encrypt_file_to(&src, &enc, "test-pass-123").unwrap();
        decrypt_file_to(&enc, &out, "test-pass-123").unwrap();
        assert_eq!(std::fs::read(&out).unwrap(), bytes);
        assert!(looks_like_sqlite(&out).unwrap());
    }
}
