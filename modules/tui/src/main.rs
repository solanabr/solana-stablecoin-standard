use std::io;
use std::time::Duration;

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
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
struct StablecoinConfig {
    mint: String,
    name: String,
    symbol: String,
    decimals: u8,
    preset: String,
    owner: String,
    master_minter: String,
    pauser: String,
    blacklister: String,
    is_paused: bool,
    total_minted: u64,
    total_burned: u64,
    enable_transfer_hook: bool,
    enable_permanent_delegate: bool,
    enable_confidential_transfers: bool,
}

#[derive(Clone)]
struct MinterInfo {
    address: String,
    allowance: u64,
    total_minted: u64,
}

#[derive(Clone)]
struct BlacklistEntry {
    address: String,
    reason: String,
}

#[derive(Clone)]
struct EventEntry {
    event_type: String,
    details: String,
    slot: u64,
}

#[derive(PartialEq, Clone, Copy)]
enum Tab {
    Overview,
    Minters,
    Blacklist,
    Events,
}

impl Tab {
    fn title(&self) -> &str {
        match self {
            Tab::Overview => "Overview",
            Tab::Minters => "Minters",
            Tab::Blacklist => "Blacklist",
            Tab::Events => "Events",
        }
    }

    fn all() -> &'static [Tab] {
        &[Tab::Overview, Tab::Minters, Tab::Blacklist, Tab::Events]
    }

    fn next(&self) -> Tab {
        match self {
            Tab::Overview => Tab::Minters,
            Tab::Minters => Tab::Blacklist,
            Tab::Blacklist => Tab::Events,
            Tab::Events => Tab::Overview,
        }
    }

    fn prev(&self) -> Tab {
        match self {
            Tab::Overview => Tab::Events,
            Tab::Minters => Tab::Overview,
            Tab::Blacklist => Tab::Minters,
            Tab::Events => Tab::Blacklist,
        }
    }
}

struct App {
    active_tab: Tab,
    config: Option<StablecoinConfig>,
    minters: Vec<MinterInfo>,
    blacklist: Vec<BlacklistEntry>,
    events: Vec<EventEntry>,
    mint_address: String,
    rpc_url: String,
    status_msg: String,
    input_mode: bool,
    input_buffer: String,
    scroll_offset: u16,
    should_quit: bool,
}

impl App {
    fn new() -> Self {
        Self {
            active_tab: Tab::Overview,
            config: None,
            minters: vec![],
            blacklist: vec![],
            events: vec![],
            mint_address: String::new(),
            rpc_url: "https://api.devnet.solana.com".to_string(),
            status_msg: "Press 'e' to enter a mint address".to_string(),
            input_mode: false,
            input_buffer: String::new(),
            scroll_offset: 0,
            should_quit: false,
        }
    }

    fn fetch_config(&mut self) {
        if self.mint_address.is_empty() {
            self.status_msg = "No mint address set".to_string();
            return;
        }

        let mint_pubkey = match self.mint_address.parse::<Pubkey>() {
            Ok(pk) => pk,
            Err(_) => {
                self.status_msg = "Invalid mint address".to_string();
                return;
            }
        };

        self.status_msg = "Fetching config...".to_string();
        let client = RpcClient::new(self.rpc_url.clone());

        let program_id: Pubkey = "SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA"
            .parse()
            .unwrap();

        let (config_pda, _) = Pubkey::find_program_address(
            &[b"config", mint_pubkey.as_ref()],
            &program_id,
        );

        match client.get_account_data(&config_pda) {
            Ok(data) => {
                if data.len() < 8 {
                    self.status_msg = "Config account too small".to_string();
                    return;
                }

                // Parse the config data (skip 8-byte discriminator)
                match Self::parse_config(&data[8..], &mint_pubkey) {
                    Ok(config) => {
                        self.config = Some(config);
                        self.status_msg = format!("Loaded config for {}", &self.mint_address[..8]);
                    }
                    Err(e) => {
                        self.status_msg = format!("Parse error: {}", e);
                    }
                }
            }
            Err(e) => {
                self.status_msg = format!("RPC error: {}", e);
            }
        }
    }

    fn parse_config(data: &[u8], mint: &Pubkey) -> Result<StablecoinConfig> {
        let mut offset = 0;

        // mint: Pubkey (32 bytes)
        offset += 32;

        // preset: enum (1 byte)
        let preset_byte = data[offset];
        let preset = match preset_byte {
            0 => "SSS-1",
            1 => "SSS-2",
            2 => "SSS-3",
            3 => "Custom",
            _ => "Unknown",
        }.to_string();
        offset += 1;

        // name: String (4 bytes len + data)
        let name_len = u32::from_le_bytes(data[offset..offset + 4].try_into()?) as usize;
        offset += 4;
        let name = String::from_utf8_lossy(&data[offset..offset + name_len]).to_string();
        offset += name_len;

        // symbol: String
        let sym_len = u32::from_le_bytes(data[offset..offset + 4].try_into()?) as usize;
        offset += 4;
        let symbol = String::from_utf8_lossy(&data[offset..offset + sym_len]).to_string();
        offset += sym_len;

        // uri: String
        let uri_len = u32::from_le_bytes(data[offset..offset + 4].try_into()?) as usize;
        offset += 4;
        offset += uri_len; // skip uri

        // decimals: u8
        let decimals = data[offset];
        offset += 1;

        // owner: Pubkey
        let owner = Pubkey::try_from(&data[offset..offset + 32])
            .map(|p| p.to_string())
            .unwrap_or_default();
        offset += 32;

        // pending_owner: Option<Pubkey> (1 + 32 bytes)
        let has_pending = data[offset] == 1;
        offset += 1;
        if has_pending {
            offset += 32;
        }

        // master_minter: Pubkey
        let master_minter = Pubkey::try_from(&data[offset..offset + 32])
            .map(|p| p.to_string())
            .unwrap_or_default();
        offset += 32;

        // pauser: Pubkey
        let pauser = Pubkey::try_from(&data[offset..offset + 32])
            .map(|p| p.to_string())
            .unwrap_or_default();
        offset += 32;

        // blacklister: Pubkey
        let blacklister = Pubkey::try_from(&data[offset..offset + 32])
            .map(|p| p.to_string())
            .unwrap_or_default();
        offset += 32;

        // is_paused: bool
        let is_paused = data[offset] != 0;
        offset += 1;

        // total_minted: u64
        let total_minted = u64::from_le_bytes(data[offset..offset + 8].try_into()?);
        offset += 8;

        // total_burned: u64
        let total_burned = u64::from_le_bytes(data[offset..offset + 8].try_into()?);
        offset += 8;

        // enable_transfer_hook: bool
        let enable_transfer_hook = data[offset] != 0;
        offset += 1;

        // enable_permanent_delegate: bool
        let enable_permanent_delegate = data[offset] != 0;
        offset += 1;

        // enable_confidential_transfers: bool
        let enable_confidential_transfers = data[offset] != 0;

        Ok(StablecoinConfig {
            mint: mint.to_string(),
            name,
            symbol,
            decimals,
            preset,
            owner,
            master_minter,
            pauser,
            blacklister,
            is_paused,
            total_minted,
            total_burned,
            enable_transfer_hook,
            enable_permanent_delegate,
            enable_confidential_transfers,
        })
    }
}

fn main() -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new();

    loop {
        terminal.draw(|f| ui(f, &app))?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind != KeyEventKind::Press {
                    continue;
                }

                if app.input_mode {
                    match key.code {
                        KeyCode::Enter => {
                            app.mint_address = app.input_buffer.clone();
                            app.input_buffer.clear();
                            app.input_mode = false;
                            app.fetch_config();
                        }
                        KeyCode::Esc => {
                            app.input_buffer.clear();
                            app.input_mode = false;
                            app.status_msg = "Input cancelled".to_string();
                        }
                        KeyCode::Char(c) => {
                            app.input_buffer.push(c);
                        }
                        KeyCode::Backspace => {
                            app.input_buffer.pop();
                        }
                        _ => {}
                    }
                } else {
                    match key.code {
                        KeyCode::Char('q') => {
                            app.should_quit = true;
                        }
                        KeyCode::Tab | KeyCode::Right => {
                            app.active_tab = app.active_tab.next();
                            app.scroll_offset = 0;
                        }
                        KeyCode::BackTab | KeyCode::Left => {
                            app.active_tab = app.active_tab.prev();
                            app.scroll_offset = 0;
                        }
                        KeyCode::Char('e') => {
                            app.input_mode = true;
                            app.input_buffer.clear();
                            app.status_msg = "Enter mint address (Esc to cancel)".to_string();
                        }
                        KeyCode::Char('r') => {
                            app.fetch_config();
                        }
                        KeyCode::Down | KeyCode::Char('j') => {
                            app.scroll_offset = app.scroll_offset.saturating_add(1);
                        }
                        KeyCode::Up | KeyCode::Char('k') => {
                            app.scroll_offset = app.scroll_offset.saturating_sub(1);
                        }
                        _ => {}
                    }
                }
            }
        }

        if app.should_quit {
            break;
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;

    Ok(())
}

fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // title
            Constraint::Length(3), // tabs
            Constraint::Min(10),  // content
            Constraint::Length(3), // status bar
        ])
        .split(f.area());

    // Title
    let title = Paragraph::new(" S\u00b3 Terminal Dashboard ")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .alignment(Alignment::Center)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
    f.render_widget(title, chunks[0]);

    // Tabs
    let tab_titles: Vec<Line> = Tab::all()
        .iter()
        .map(|t| {
            let style = if *t == app.active_tab {
                Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(Color::DarkGray)
            };
            Line::from(Span::styled(format!(" {} ", t.title()), style))
        })
        .collect();
    let tabs = Tabs::new(tab_titles)
        .block(Block::default().borders(Borders::ALL).title(" Navigation "))
        .highlight_style(Style::default().fg(Color::Yellow))
        .select(Tab::all().iter().position(|t| *t == app.active_tab).unwrap_or(0))
        .divider("|");
    f.render_widget(tabs, chunks[1]);

    // Content
    match app.active_tab {
        Tab::Overview => render_overview(f, app, chunks[2]),
        Tab::Minters => render_minters(f, app, chunks[2]),
        Tab::Blacklist => render_blacklist(f, app, chunks[2]),
        Tab::Events => render_events(f, app, chunks[2]),
    }

    // Status bar
    let status_text = if app.input_mode {
        format!(" Input: {}_ | Esc: cancel | Enter: confirm", app.input_buffer)
    } else {
        format!(
            " {} | q: quit | Tab: switch | e: enter mint | r: refresh",
            app.status_msg
        )
    };
    let status = Paragraph::new(status_text)
        .style(Style::default().fg(Color::White).bg(Color::DarkGray))
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
    f.render_widget(status, chunks[3]);
}

fn render_overview(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title(" Overview ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    match &app.config {
        Some(config) => {
            let inner = block.inner(area);
            f.render_widget(block, area);

            let rows = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(5), // stats
                    Constraint::Min(5),   // details
                ])
                .split(inner);

            // Stats row
            let stats_cols = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                    Constraint::Percentage(25),
                ])
                .split(rows[0]);

            let supply = config.total_minted.saturating_sub(config.total_burned);
            let stats = [
                ("Supply", format!("{}", supply), Color::Cyan),
                ("Minted", format!("{}", config.total_minted), Color::Green),
                ("Burned", format!("{}", config.total_burned), Color::Red),
                (
                    "Status",
                    if config.is_paused { "PAUSED".into() } else { "ACTIVE".into() },
                    if config.is_paused { Color::Red } else { Color::Green },
                ),
            ];
            for (i, (label, value, color)) in stats.iter().enumerate() {
                let stat = Paragraph::new(vec![
                    Line::from(Span::styled(*label, Style::default().fg(Color::DarkGray))),
                    Line::from(Span::styled(value.as_str(), Style::default().fg(*color).add_modifier(Modifier::BOLD))),
                ])
                .alignment(Alignment::Center)
                .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
                f.render_widget(stat, stats_cols[i]);
            }

            // Details table
            let decimals_str = config.decimals.to_string();
            let detail_rows = vec![
                Row::new(vec!["Name", config.name.as_str()]),
                Row::new(vec!["Symbol", config.symbol.as_str()]),
                Row::new(vec!["Decimals", decimals_str.as_str()]),
                Row::new(vec!["Preset", config.preset.as_str()]),
                Row::new(vec!["Mint", config.mint.as_str()]),
                Row::new(vec!["Owner", config.owner.as_str()]),
                Row::new(vec!["Master Minter", config.master_minter.as_str()]),
                Row::new(vec!["Pauser", config.pauser.as_str()]),
                Row::new(vec!["Blacklister", config.blacklister.as_str()]),
                Row::new(vec![
                    "Transfer Hook",
                    if config.enable_transfer_hook { "Enabled" } else { "Disabled" },
                ]),
                Row::new(vec![
                    "Permanent Delegate",
                    if config.enable_permanent_delegate { "Enabled" } else { "Disabled" },
                ]),
                Row::new(vec![
                    "Confidential Transfers",
                    if config.enable_confidential_transfers { "Enabled" } else { "Disabled" },
                ]),
            ];

            let table = Table::new(
                detail_rows,
                [Constraint::Length(24), Constraint::Min(20)],
            )
            .block(Block::default().title(" Details ").borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)))
            .row_highlight_style(Style::default().bg(Color::DarkGray))
            .style(Style::default().fg(Color::White))
            .column_spacing(2);

            f.render_widget(table, rows[1]);
        }
        None => {
            let msg = Paragraph::new("\n\n  No stablecoin loaded.\n  Press 'e' to enter a mint address.")
                .style(Style::default().fg(Color::DarkGray))
                .block(block);
            f.render_widget(msg, area);
        }
    }
}

fn render_minters(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title(" Minters ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow));

    if app.minters.is_empty() {
        let msg = Paragraph::new("\n\n  No minters found.\n  Minters are loaded from on-chain data when available.")
            .style(Style::default().fg(Color::DarkGray))
            .block(block);
        f.render_widget(msg, area);
        return;
    }

    let rows: Vec<Row> = app
        .minters
        .iter()
        .map(|m| {
            Row::new(vec![
                m.address.clone(),
                format!("{}", m.allowance),
                format!("{}", m.total_minted),
            ])
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Min(44),
            Constraint::Length(16),
            Constraint::Length(16),
        ],
    )
    .header(
        Row::new(vec!["Address", "Allowance", "Total Minted"])
            .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
    )
    .block(block)
    .column_spacing(2);

    f.render_widget(table, area);
}

fn render_blacklist(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title(" Blacklist ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Red));

    if app.blacklist.is_empty() {
        let msg = Paragraph::new("\n\n  No blacklisted addresses.\n  Blacklist data is loaded from on-chain accounts when available.")
            .style(Style::default().fg(Color::DarkGray))
            .block(block);
        f.render_widget(msg, area);
        return;
    }

    let rows: Vec<Row> = app
        .blacklist
        .iter()
        .map(|b| Row::new(vec![b.address.clone(), b.reason.clone()]))
        .collect();

    let table = Table::new(
        rows,
        [Constraint::Min(44), Constraint::Min(20)],
    )
    .header(
        Row::new(vec!["Address", "Reason"])
            .style(Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)),
    )
    .block(block)
    .column_spacing(2);

    f.render_widget(table, area);
}

fn render_events(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .title(" Events ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Magenta));

    if app.events.is_empty() {
        let msg = Paragraph::new("\n\n  No events recorded.\n  Events will appear as on-chain activity is detected.")
            .style(Style::default().fg(Color::DarkGray))
            .block(block);
        f.render_widget(msg, area);
        return;
    }

    let rows: Vec<Row> = app
        .events
        .iter()
        .map(|e| {
            Row::new(vec![
                format!("{}", e.slot),
                e.event_type.clone(),
                e.details.clone(),
            ])
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(12),
            Constraint::Length(20),
            Constraint::Min(30),
        ],
    )
    .header(
        Row::new(vec!["Slot", "Event", "Details"])
            .style(Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)),
    )
    .block(block)
    .column_spacing(2);

    f.render_widget(table, area);
}
