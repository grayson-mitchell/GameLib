//! The verdict types (Phase 82 D-06). `Tri` is the only verdict a destructive guard returns;
//! `Probe` is the only shape a reader returns, so "absent" and "could not read" cannot be
//! collapsed into one another.

use serde::{Deserialize, Serialize};

/// A check result. Destructive operations proceed only on `Yes`: `No` and `Unknown` both refuse.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tri {
    Yes,
    No,
    Unknown,
}

impl Tri {
    /// Kleene AND: `No` beats `Unknown`; everything else needs two `Yes`.
    pub fn and(self, other: Tri) -> Tri {
        match (self, other) {
            (Tri::No, _) | (_, Tri::No) => Tri::No,
            (Tri::Yes, Tri::Yes) => Tri::Yes,
            _ => Tri::Unknown,
        }
    }

    /// Destructive ops proceed only when the verdict is `Yes`.
    pub fn allows(self) -> bool {
        self == Tri::Yes
    }
}

/// The outcome of reading something: present, genuinely absent, or unreadable.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Probe<T> {
    Present(T),
    Absent,
    Unreadable(String),
}

impl<T> From<std::io::Result<T>> for Probe<T> {
    fn from(r: std::io::Result<T>) -> Self {
        match r {
            Ok(v) => Probe::Present(v),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Probe::Absent,
            Err(e) => Probe::Unreadable(format!("{:?}", e.kind())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    const ALL: [Tri; 3] = [Tri::Yes, Tri::No, Tri::Unknown];

    #[test]
    fn and_is_kleene() {
        assert_eq!(Tri::Yes.and(Tri::Yes), Tri::Yes);
        assert_eq!(Tri::Yes.and(Tri::Unknown), Tri::Unknown);
        assert_eq!(Tri::Unknown.and(Tri::Yes), Tri::Unknown);
        assert_eq!(Tri::Unknown.and(Tri::Unknown), Tri::Unknown);
        assert_eq!(Tri::No.and(Tri::Unknown), Tri::No);
        assert_eq!(Tri::Unknown.and(Tri::No), Tri::No);
        assert_eq!(Tri::Yes.and(Tri::No), Tri::No);
    }

    #[test]
    fn and_is_commutative() {
        for a in ALL {
            for b in ALL {
                assert_eq!(a.and(b), b.and(a));
            }
        }
    }

    #[test]
    fn only_yes_allows() {
        assert!(Tri::Yes.allows());
        assert!(!Tri::No.allows());
        assert!(!Tri::Unknown.allows());
    }

    #[test]
    fn serde_names_are_kebab() {
        assert_eq!(serde_json::to_string(&Tri::Unknown).unwrap(), "\"unknown\"");
        let t: Tri = serde_json::from_str("\"yes\"").unwrap();
        assert_eq!(t, Tri::Yes);
    }

    #[test]
    fn probe_separates_absent_from_unreadable() {
        let absent: Probe<()> = Err(io::Error::from(io::ErrorKind::NotFound)).into();
        assert_eq!(absent, Probe::Absent);
        let denied: Probe<()> = Err(io::Error::from(io::ErrorKind::PermissionDenied)).into();
        assert_eq!(denied, Probe::Unreadable("PermissionDenied".into()));
        let ok: Probe<u8> = Ok(7).into();
        assert_eq!(ok, Probe::Present(7));
    }
}
