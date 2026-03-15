fn main() {
    if let Err(error) = sss_admin_tui::run() {
        eprintln!("error: {error:#}");
        std::process::exit(1);
    }
}
