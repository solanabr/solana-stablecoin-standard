mod app;
mod ui;

use std::io;
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEventKind, KeyModifiers};
use crossterm::execute;
use crossterm::terminal::{
  disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use solana_sdk::pubkey::Pubkey;

use app::App;

const DEFAULT_RPC: &str = "http://127.0.0.1:8899";
const DEFAULT_KEYPAIR: &str = "~/.config/solana/id.json";
const TICK_RATE: Duration = Duration::from_millis(250);

fn main() -> Result<()> {
  // Ensure terminal is restored even on panic
  let default_hook = std::panic::take_hook();
  std::panic::set_hook(Box::new(move |info| {
    let _ = disable_raw_mode();
    let _ = execute!(io::stdout(), LeaveAlternateScreen);
    default_hook(info);
  }));

  let args: Vec<String> = std::env::args().collect();

  if args.len() < 2 || args[1] == "--help" || args[1] == "-h" {
    print_usage();
    return Ok(());
  }

  let mint_str = &args[1];
  let mint: Pubkey = mint_str
    .parse()
    .map_err(|_| anyhow::anyhow!("Invalid mint address: {}", mint_str))?;

  let rpc_url = args
    .iter()
    .position(|a| a == "--rpc" || a == "-u")
    .and_then(|i| args.get(i + 1))
    .map(String::as_str)
    .unwrap_or(DEFAULT_RPC);

  let keypair_raw = args
    .iter()
    .position(|a| a == "--keypair" || a == "-k")
    .and_then(|i| args.get(i + 1))
    .map(String::as_str)
    .unwrap_or(DEFAULT_KEYPAIR);

  let keypair_path = expand_tilde(keypair_raw);

  let mut app = App::new(rpc_url, &keypair_path, mint)?;

  // Initial data fetch
  app.refresh();

  // Setup terminal
  enable_raw_mode()?;
  let mut stdout = io::stdout();
  execute!(stdout, EnterAlternateScreen)?;
  let backend = CrosstermBackend::new(stdout);
  let mut terminal = Terminal::new(backend)?;
  terminal.clear()?;

  // Run event loop
  let result = run_loop(&mut terminal, &mut app);

  // Restore terminal (always, even on error)
  disable_raw_mode()?;
  execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
  terminal.show_cursor()?;

  result
}

fn run_loop(
  terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
  app: &mut App,
) -> Result<()> {
  let mut last_tick = Instant::now();

  loop {
    terminal.draw(|frame| ui::draw(frame, app))?;

    let timeout = TICK_RATE.saturating_sub(last_tick.elapsed());
    if event::poll(timeout)? {
      if let Event::Key(key) = event::read()? {
        if key.kind == KeyEventKind::Press {
          match key.code {
            KeyCode::Char('q') => {
              app.should_quit = true;
            }
            KeyCode::Char('r') => {
              app.refresh();
            }
            KeyCode::Tab => {
              if key.modifiers.contains(KeyModifiers::SHIFT) {
                app.prev_tab();
              } else {
                app.next_tab();
              }
            }
            KeyCode::BackTab => {
              app.prev_tab();
            }
            KeyCode::Up | KeyCode::Char('k') => {
              app.select_prev();
            }
            KeyCode::Down | KeyCode::Char('j') => {
              app.select_next();
            }
            KeyCode::Left | KeyCode::Char('h') => {
              app.prev_tab();
            }
            KeyCode::Right | KeyCode::Char('l') => {
              app.next_tab();
            }
            _ => {}
          }
        }
      }
    }

    if last_tick.elapsed() >= TICK_RATE {
      last_tick = Instant::now();
    }

    if app.should_quit {
      return Ok(());
    }
  }
}

fn print_usage() {
  eprintln!("SSS Admin TUI - Solana Stablecoin Standard Dashboard");
  eprintln!();
  eprintln!("Usage: sss-tui <MINT_ADDRESS> [OPTIONS]");
  eprintln!();
  eprintln!("Arguments:");
  eprintln!("  <MINT_ADDRESS>   Base58 mint public key");
  eprintln!();
  eprintln!("Options:");
  eprintln!("  -u, --rpc <URL>         RPC endpoint (default: {})", DEFAULT_RPC);
  eprintln!("  -k, --keypair <PATH>    Keypair file (default: {})", DEFAULT_KEYPAIR);
  eprintln!("  -h, --help              Show this help message");
  eprintln!();
  eprintln!("Keybindings:");
  eprintln!("  Tab / Shift+Tab   Switch tabs");
  eprintln!("  Left / Right      Switch tabs");
  eprintln!("  Up / Down         Navigate lists");
  eprintln!("  r                 Refresh data");
  eprintln!("  q                 Quit");
}

/// Expand `~` to the user's home directory.
fn expand_tilde(path: &str) -> String {
  if path.starts_with("~/") {
    if let Some(home) = std::env::var_os("HOME") {
      return format!("{}/{}", home.to_string_lossy(), &path[2..]);
    }
  }
  path.to_string()
}
