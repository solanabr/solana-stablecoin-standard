use std::io;
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    prelude::*,
    widgets::*,
};
use solana_sdk::pubkey::Pubkey;
use anchor_lang::AccountDeserialize;
use sss_token::state::{StablecoinConfig, RoleRegistry};

use crate::config::CliConfig;
use crate::pda::{get_config_pda, get_role_registry_pda};

struct AppState {
    config: Option<StablecoinConfig>,
    roles: Option<RoleRegistry>,
    last_refresh: Instant,
    error: Option<String>,
    mint: Pubkey,
    supply: u64,
    tab: usize,
}

pub fn run_dashboard(cli_config: &CliConfig, mint: &Pubkey) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = AppState {
        config: None,
        roles: None,
        last_refresh: Instant::now() - Duration::from_secs(10),
        error: None,
        mint: *mint,
        supply: 0,
        tab: 0,
    };

    loop {
        // Refresh data every 5 seconds
        if state.last_refresh.elapsed() > Duration::from_secs(5) {
            refresh_data(cli_config, &mut state);
        }

        terminal.draw(|f| ui(f, &state))?;

        if event::poll(Duration::from_millis(250))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => break,
                        KeyCode::Char('r') => {
                            state.last_refresh = Instant::now() - Duration::from_secs(10);
                        }
                        KeyCode::Tab | KeyCode::Right => {
                            state.tab = (state.tab + 1) % 3;
                        }
                        KeyCode::BackTab | KeyCode::Left => {
                            state.tab = if state.tab == 0 { 2 } else { state.tab - 1 };
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    Ok(())
}

fn refresh_data(cli_config: &CliConfig, state: &mut AppState) {
    state.last_refresh = Instant::now();
    state.error = None;

    let (config_pda, _) = get_config_pda(&state.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    match cli_config.rpc_client.get_account_data(&config_pda) {
        Ok(data) => {
            match StablecoinConfig::try_deserialize(&mut &data[..]) {
                Ok(config) => {
                    state.supply = config.total_minted.saturating_sub(config.total_burned);
                    state.config = Some(config);
                }
                Err(e) => state.error = Some(format!("Deserialize error: {}", e)),
            }
        }
        Err(e) => state.error = Some(format!("RPC error: {}", e)),
    }

    match cli_config.rpc_client.get_account_data(&role_registry_pda) {
        Ok(data) => {
            match RoleRegistry::try_deserialize(&mut &data[..]) {
                Ok(roles) => state.roles = Some(roles),
                Err(_) => {}
            }
        }
        Err(_) => {}
    }
}

fn ui(f: &mut Frame, state: &AppState) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Title
            Constraint::Length(3),  // Tabs
            Constraint::Min(10),   // Content
            Constraint::Length(3), // Status bar
        ])
        .split(f.area());

    // Title
    let title = if let Some(ref config) = state.config {
        format!(" SSS Dashboard - {} ({}) ", config.name, config.symbol)
    } else {
        " SSS Dashboard - Loading... ".to_string()
    };
    let title_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .style(Style::default().fg(Color::Cyan));
    let title_text = Paragraph::new(title)
        .alignment(Alignment::Center)
        .block(title_block);
    f.render_widget(title_text, chunks[0]);

    // Tabs
    let tab_titles = vec!["Overview", "Roles", "Supply"];
    let tabs = Tabs::new(tab_titles)
        .block(Block::default().borders(Borders::ALL).title(" Tabs "))
        .select(state.tab)
        .style(Style::default().fg(Color::White))
        .highlight_style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    f.render_widget(tabs, chunks[1]);

    // Content
    match state.tab {
        0 => render_overview(f, chunks[2], state),
        1 => render_roles(f, chunks[2], state),
        2 => render_supply(f, chunks[2], state),
        _ => {}
    }

    // Status bar
    let status = if let Some(ref err) = state.error {
        Span::styled(format!(" Error: {} ", err), Style::default().fg(Color::Red))
    } else {
        Span::styled(
            format!(" Last refresh: {:.0}s ago | Press 'r' to refresh | 'q' to quit | Tab to switch views ",
                state.last_refresh.elapsed().as_secs_f64()),
            Style::default().fg(Color::DarkGray),
        )
    };
    let status_bar = Paragraph::new(Line::from(status))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(status_bar, chunks[3]);
}

fn render_overview(f: &mut Frame, area: Rect, state: &AppState) {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(" Overview ")
        .border_type(BorderType::Rounded);

    if let Some(ref config) = state.config {
        let preset_name = match config.preset {
            sss_token::state::StablecoinPreset::SSS1 => "SSS-1 (Minimal)",
            sss_token::state::StablecoinPreset::SSS2 => "SSS-2 (Compliant)",
            sss_token::state::StablecoinPreset::SSS3 => "SSS-3 (Private)",
            sss_token::state::StablecoinPreset::Custom => "Custom",
        };

        let divisor = 10u64.pow(config.decimals as u32);
        let supply_display = format!("{}.{:0>width$}",
            state.supply / divisor,
            state.supply % divisor,
            width = config.decimals as usize
        );

        let mut features = Vec::new();
        if config.enable_permanent_delegate { features.push("Permanent Delegate"); }
        if config.enable_transfer_hook { features.push("Transfer Hook"); }
        if config.default_account_frozen { features.push("Default Frozen"); }
        if config.enable_confidential_transfers { features.push("Confidential Transfers"); }

        let mint_str = config.mint.to_string();
        let decimals_str = config.decimals.to_string();
        let paused_str = if config.is_paused { "YES" } else { "No" };
        let features_str = features.join(", ");
        let attestation_str = config.reserve_attestation_index.to_string();

        let rows = vec![
            Row::new(vec!["Mint", mint_str.as_str()]),
            Row::new(vec!["Preset", preset_name]),
            Row::new(vec!["Decimals", decimals_str.as_str()]),
            Row::new(vec!["Supply", supply_display.as_str()]),
            Row::new(vec!["Paused", paused_str]),
            Row::new(vec!["Features", features_str.as_str()]),
            Row::new(vec!["Attestations", attestation_str.as_str()]),
        ];

        let table = Table::new(rows, [Constraint::Length(15), Constraint::Min(40)])
            .block(block)
            .style(Style::default().fg(Color::White))
            .row_highlight_style(Style::default().add_modifier(Modifier::BOLD));
        f.render_widget(table, area);
    } else {
        let msg = Paragraph::new("Loading stablecoin data...").block(block);
        f.render_widget(msg, area);
    }
}

fn render_roles(f: &mut Frame, area: Rect, state: &AppState) {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(" Roles ")
        .border_type(BorderType::Rounded);

    if let Some(ref roles) = state.roles {
        let default_pk = Pubkey::default();
        let fmt = |pk: &Pubkey| -> String {
            if *pk == default_pk { "(not set)".to_string() } else { pk.to_string() }
        };

        let master_str = roles.master_authority.to_string();
        let pauser_str = fmt(&roles.pauser);
        let blacklister_str = fmt(&roles.blacklister);
        let seizer_str = fmt(&roles.seizer);

        let rows = vec![
            Row::new(vec!["Master Authority", master_str.as_str()])
                .style(Style::default().fg(Color::Yellow)),
            Row::new(vec!["Pauser", pauser_str.as_str()]),
            Row::new(vec!["Blacklister", blacklister_str.as_str()]),
            Row::new(vec!["Seizer", seizer_str.as_str()]),
        ];

        let table = Table::new(rows, [Constraint::Length(18), Constraint::Min(44)])
            .block(block)
            .style(Style::default().fg(Color::White));
        f.render_widget(table, area);
    } else {
        let msg = Paragraph::new("Loading role data...").block(block);
        f.render_widget(msg, area);
    }
}

fn render_supply(f: &mut Frame, area: Rect, state: &AppState) {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(" Supply Details ")
        .border_type(BorderType::Rounded);

    if let Some(ref config) = state.config {
        let divisor = 10u64.pow(config.decimals as u32);
        let fmt_amount = |amount: u64| -> String {
            format!("{}.{:0>width$}",
                amount / divisor,
                amount % divisor,
                width = config.decimals as usize
            )
        };

        let minted = config.total_minted;
        let burned = config.total_burned;
        let supply = minted.saturating_sub(burned);

        let max_val = std::cmp::max(minted, 1);
        let supply_pct = (supply as f64 / max_val as f64 * 100.0) as u16;
        let burned_pct = (burned as f64 / max_val as f64 * 100.0) as u16;

        let minted_str = fmt_amount(minted);
        let burned_str = fmt_amount(burned);
        let supply_str = fmt_amount(supply);
        let supply_pct_str = format!("{}%", supply_pct);
        let burned_pct_str = format!("{}%", burned_pct);

        let rows = vec![
            Row::new(vec!["Total Minted", minted_str.as_str()]),
            Row::new(vec!["Total Burned", burned_str.as_str()])
                .style(Style::default().fg(Color::Red)),
            Row::new(vec!["Current Supply", supply_str.as_str()])
                .style(Style::default().fg(Color::Green)),
            Row::new(vec!["", ""]),
            Row::new(vec!["Supply %", supply_pct_str.as_str()]),
            Row::new(vec!["Burned %", burned_pct_str.as_str()]),
        ];

        let table = Table::new(rows, [Constraint::Length(16), Constraint::Min(30)])
            .block(block)
            .style(Style::default().fg(Color::White));
        f.render_widget(table, area);
    } else {
        let msg = Paragraph::new("Loading supply data...").block(block);
        f.render_widget(msg, area);
    }
}
