//! Path validation for backup / export / restore destinations.
use anyhow::{bail, Result};
use std::path::{Component, Path, PathBuf};

/// Reject empty, relative, NUL, or `..` path components before any filesystem write.
pub fn require_absolute_no_traversal(path: &Path) -> Result<PathBuf> {
    let raw = path.as_os_str();
    if raw.is_empty() {
        bail!("Path is empty");
    }
    if raw.to_string_lossy().contains('\0') {
        bail!("Path contains illegal NUL byte");
    }
    if !path.is_absolute() {
        bail!("Path must be absolute: {}", path.display());
    }
    for c in path.components() {
        if matches!(c, Component::ParentDir) {
            bail!("Path must not contain '..': {}", path.display());
        }
    }
    Ok(path.to_path_buf())
}

/// Confirm `candidate` resolves under `parent` (both absolute, no `..`).
pub fn require_under_parent(parent: &Path, candidate: &Path) -> Result<PathBuf> {
    let parent = require_absolute_no_traversal(parent)?;
    let candidate = require_absolute_no_traversal(candidate)?;
    let parent_canon = parent
        .canonicalize()
        .unwrap_or_else(|_| parent.clone());
    // Candidate may not exist yet — canonicalize parent + file name.
    let cand_parent = candidate
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Path has no parent"))?;
    let cand_parent_canon = if cand_parent.exists() {
        cand_parent.canonicalize().unwrap_or_else(|_| cand_parent.to_path_buf())
    } else {
        cand_parent.to_path_buf()
    };
    let name = candidate
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Path has no file name"))?;
    let resolved = cand_parent_canon.join(name);
    if !resolved.starts_with(&parent_canon) && !resolved.starts_with(&parent) {
        bail!(
            "Path escapes allowed directory ({} not under {})",
            resolved.display(),
            parent.display()
        );
    }
    Ok(resolved)
}

/// Overwrite-then-delete best-effort wipe for temporary plaintext DB snapshots.
pub fn shred_temp_file(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let len = meta.len();
        if len > 0 && len < 512 * 1024 * 1024 {
            let chunk = vec![0u8; std::cmp::min(len as usize, 1024 * 1024)];
            if let Ok(mut f) = std::fs::File::create(path) {
                use std::io::Write;
                let mut remaining = len;
                while remaining > 0 {
                    let n = std::cmp::min(remaining as usize, chunk.len());
                    if f.write_all(&chunk[..n]).is_err() {
                        break;
                    }
                    remaining -= n as u64;
                }
                let _ = f.flush();
            }
        }
    }
    let _ = std::fs::remove_file(path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_and_dotdot() {
        assert!(require_absolute_no_traversal(Path::new("foo/bar")).is_err());
        assert!(require_absolute_no_traversal(Path::new("/tmp/../etc/passwd")).is_err());
        assert!(require_absolute_no_traversal(Path::new("/tmp/ok.rfbk")).is_ok());
    }
}
