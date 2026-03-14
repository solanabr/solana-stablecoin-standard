#![forbid(unsafe_code)]

#[cfg(test)]
mod smoke {
    #[test]
    fn trident_layout_present() {
        assert!(std::path::Path::new("Trident.toml").exists());
        assert!(std::path::Path::new("fuzz_0/test_fuzz.rs").exists());
        assert!(std::path::Path::new("fuzz_1/test_fuzz.rs").exists());
    }
}
