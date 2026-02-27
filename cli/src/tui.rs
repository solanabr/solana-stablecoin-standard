use std::collections::VecDeque;
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
use solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config;
use solana_client::rpc_response::RpcConfirmedTransactionStatusWithSignature;
use sss_token::state::{
    StablecoinConfig, RoleRegistry, MinterInfo, BlacklistEntry, ReserveAttestation,
};

use crate::config::CliConfig;
use crate::pda::{
    get_config_pda, get_role_registry_pda, get_reserve_attestation_pda, SSS_TOKEN_PROGRAM_ID,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_COUNT: usize = 7;
const SUPPLY_HISTORY_LEN: usize = 60;
const MAX_ATTESTATIONS: u64 = 20;
const MAX_SIGNATURES: usize = 25;
const REFRESH_SECS: u64 = 5;

// Theme colors
const ACCENT: Color = Color::Cyan;
const SUCCESS: Color = Color::Green;
const WARNING: Color = Color::Yellow;
const DANGER: Color = Color::Red;
const MUTED: Color = Color::DarkGray;

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

struct AppState {
    config: Option<StablecoinConfig>,
    roles: Option<RoleRegistry>,
    mint: Pubkey,
    supply: u64,
    tab: usize,

    minters: Vec<(Pubkey, MinterInfo)>,
    blacklist_entries: Vec<(Pubkey, BlacklistEntry)>,
    attestations: Vec<ReserveAttestation>,
    signatures: Vec<RpcConfirmedTransactionStatusWithSignature>,

    supply_history: VecDeque<u64>,
    block_height: u64,

    scroll_offset: usize,
    selected_item: usize,
    search_query: String,
    search_mode: bool,

    last_refresh: Instant,
    error: Option<String>,
    refresh_interval: Duration,
}

impl AppState {
    fn new(mint: Pubkey) -> Self {
        Self {
            config: None,
            roles: None,
            mint,
            supply: 0,
            tab: 0,
            minters: Vec::new(),
            blacklist_entries: Vec::new(),
            attestations: Vec::new(),
            signatures: Vec::new(),
            supply_history: VecDeque::with_capacity(SUPPLY_HISTORY_LEN),
            block_height: 0,
            scroll_offset: 0,
            selected_item: 0,
            search_query: String::new(),
            search_mode: false,
            last_refresh: Instant::now() - Duration::from_secs(10),
            error: None,
            refresh_interval: Duration::from_secs(REFRESH_SECS),
        }
    }

    fn refresh_countdown(&self) -> u64 {
        let elapsed = self.last_refresh.elapsed();
        if elapsed >= self.refresh_interval {
            0
        } else {
            (self.refresh_interval - elapsed).as_secs()
        }
    }

    fn scrollable_len(&self) -> usize {
        match self.tab {
            3 => self.minters.len(),
            4 => self.filtered_blacklist().len(),
            5 => self.attestations.len(),
            6 => self.signatures.len(),
            _ => 0,
        }
    }

    fn filtered_blacklist(&self) -> Vec<&(Pubkey, BlacklistEntry)> {
        if self.search_query.is_empty() {
            self.blacklist_entries.iter().collect()
        } else {
            let q = self.search_query.to_lowercase();
            self.blacklist_entries
                .iter()
                .filter(|(pk, entry)| {
                    pk.to_string().to_lowercase().contains(&q)
                        || entry.blocked_address.to_string().to_lowercase().contains(&q)
                        || entry.reason.to_lowercase().contains(&q)
                })
                .collect()
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn run_dashboard(cli_config: &CliConfig, mint: &Pubkey) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = AppState::new(*mint);

    loop {
        if state.last_refresh.elapsed() >= state.refresh_interval {
            refresh_data(cli_config, &mut state);
        }

        terminal.draw(|f| ui(f, &state))?;

        if event::poll(Duration::from_millis(200))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    if state.search_mode {
                        match key.code {
                            KeyCode::Esc => {
                                state.search_mode = false;
                            }
                            KeyCode::Enter => {
                                state.search_mode = false;
                                state.scroll_offset = 0;
                            }
                            KeyCode::Backspace => {
                                state.search_query.pop();
                            }
                            KeyCode::Char(c) => {
                                state.search_query.push(c);
                            }
                            _ => {}
                        }
                    } else {
                        match key.code {
                            KeyCode::Char('q') | KeyCode::Esc => break,
                            KeyCode::Char('r') => {
                                state.last_refresh =
                                    Instant::now() - Duration::from_secs(REFRESH_SECS + 1);
                            }
                            KeyCode::Tab | KeyCode::Right => {
                                state.tab = (state.tab + 1) % TAB_COUNT;
                                state.scroll_offset = 0;
                                state.selected_item = 0;
                            }
                            KeyCode::BackTab | KeyCode::Left => {
                                state.tab = if state.tab == 0 {
                                    TAB_COUNT - 1
                                } else {
                                    state.tab - 1
                                };
                                state.scroll_offset = 0;
                                state.selected_item = 0;
                            }
                            KeyCode::Up => {
                                if state.scroll_offset > 0 {
                                    state.scroll_offset -= 1;
                                }
                            }
                            KeyCode::Down => {
                                let max = state.scrollable_len();
                                if max > 0 && state.scroll_offset < max.saturating_sub(1) {
                                    state.scroll_offset += 1;
                                }
                            }
                            KeyCode::Char('/') => {
                                state.search_mode = true;
                                state.search_query.clear();
                            }
                            KeyCode::Enter => {
                                // Show explorer link for activity log
                                // (handled in render, Enter just selects)
                                state.selected_item = state.scroll_offset;
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Data refresh
// ---------------------------------------------------------------------------

fn refresh_data(cli_config: &CliConfig, state: &mut AppState) {
    state.last_refresh = Instant::now();
    state.error = None;

    let (config_pda, _) = get_config_pda(&state.mint);
    let (role_registry_pda, _) = get_role_registry_pda(&config_pda);

    // Config
    match cli_config.rpc_client.get_account_data(&config_pda) {
        Ok(data) => match StablecoinConfig::try_deserialize(&mut &data[..]) {
            Ok(config) => {
                state.supply = config.total_minted.saturating_sub(config.total_burned);
                // Push to history ring buffer
                if state.supply_history.len() >= SUPPLY_HISTORY_LEN {
                    state.supply_history.pop_front();
                }
                state.supply_history.push_back(state.supply);
                state.config = Some(config);
            }
            Err(e) => state.error = Some(format!("Config deserialize: {}", e)),
        },
        Err(e) => state.error = Some(format!("RPC error: {}", e)),
    }

    // Roles
    if let Ok(data) = cli_config.rpc_client.get_account_data(&role_registry_pda) {
        if let Ok(roles) = RoleRegistry::try_deserialize(&mut &data[..]) {
            state.roles = Some(roles);
        }
    }

    // Block height
    if let Ok(height) = cli_config.rpc_client.get_block_height() {
        state.block_height = height;
    }

    // Minters via get_program_accounts
    match cli_config.rpc_client.get_program_accounts(&SSS_TOKEN_PROGRAM_ID) {
        Ok(accounts) => {
            let mut minters = Vec::new();
            let mut blacklist = Vec::new();

            for (pubkey, account) in accounts {
                if account.data.len() == MinterInfo::SPACE {
                    if let Ok(info) =
                        MinterInfo::try_deserialize(&mut account.data.as_slice())
                    {
                        if info.config == config_pda {
                            minters.push((pubkey, info));
                        }
                    }
                } else if account.data.len() == BlacklistEntry::SPACE {
                    if let Ok(entry) =
                        BlacklistEntry::try_deserialize(&mut account.data.as_slice())
                    {
                        if entry.config == config_pda {
                            blacklist.push((pubkey, entry));
                        }
                    }
                }
            }

            state.minters = minters;
            state.blacklist_entries = blacklist;
        }
        Err(_) => {
            // Silently ignore; preserve previous data
        }
    }

    // Attestations (fetch from latest index down to max 20)
    if let Some(ref config) = state.config {
        let idx = config.reserve_attestation_index;
        let mut attestations = Vec::new();
        if idx > 0 {
            let start = if idx > MAX_ATTESTATIONS {
                idx - MAX_ATTESTATIONS
            } else {
                0
            };
            for i in (start..idx).rev() {
                let (att_pda, _) = get_reserve_attestation_pda(&config_pda, i);
                if let Ok(data) = cli_config.rpc_client.get_account_data(&att_pda) {
                    if let Ok(att) =
                        ReserveAttestation::try_deserialize(&mut data.as_slice())
                    {
                        attestations.push(att);
                    }
                }
            }
        }
        state.attestations = attestations;
    }

    // Recent signatures
    let sig_config = GetConfirmedSignaturesForAddress2Config {
        limit: Some(MAX_SIGNATURES),
        ..Default::default()
    };
    if let Ok(sigs) = cli_config
        .rpc_client
        .get_signatures_for_address_with_config(&config_pda, sig_config)
    {
        state.signatures = sigs;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn fmt_amount(amount: u64, decimals: u8) -> String {
    let divisor = 10u64.pow(decimals as u32);
    format!(
        "{}.{:0>width$}",
        amount / divisor,
        amount % divisor,
        width = decimals as usize
    )
}

fn fmt_pubkey(pk: &Pubkey) -> String {
    let s = pk.to_string();
    if s.len() > 12 {
        format!("{}...{}", &s[..6], &s[s.len() - 4..])
    } else {
        s
    }
}

fn fmt_pubkey_or_unset(pk: &Pubkey) -> (String, Style) {
    if *pk == Pubkey::default() {
        ("(not set)".to_string(), Style::default().fg(MUTED).italic())
    } else {
        (pk.to_string(), Style::default().fg(Color::White))
    }
}

fn format_number(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push(',');
        }
        result.push(c);
    }
    result.chars().rev().collect()
}

fn preset_name(config: &StablecoinConfig) -> &'static str {
    match config.preset {
        sss_token::state::StablecoinPreset::SSS1 => "SSS-1 (Minimal)",
        sss_token::state::StablecoinPreset::SSS2 => "SSS-2 (Compliant)",
        sss_token::state::StablecoinPreset::SSS3 => "SSS-3 (Private)",
        sss_token::state::StablecoinPreset::Custom => "Custom",
    }
}

fn hex_short(bytes: &[u8; 32]) -> String {
    let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    if hex.len() > 16 {
        format!("{}...{}", &hex[..8], &hex[hex.len() - 8..])
    } else {
        hex
    }
}

// ---------------------------------------------------------------------------
// Main UI dispatcher
// ---------------------------------------------------------------------------

fn ui(f: &mut Frame, state: &AppState) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Title bar
            Constraint::Length(3), // Tabs
            Constraint::Min(10),  // Content
            Constraint::Length(3), // Status bar
        ])
        .split(f.area());

    render_title_bar(f, chunks[0], state);
    render_tabs(f, chunks[1], state);

    match state.tab {
        0 => render_overview(f, chunks[2], state),
        1 => render_supply_analytics(f, chunks[2], state),
        2 => render_roles(f, chunks[2], state),
        3 => render_minters(f, chunks[2], state),
        4 => render_blacklist(f, chunks[2], state),
        5 => render_attestations(f, chunks[2], state),
        6 => render_activity_log(f, chunks[2], state),
        _ => {}
    }

    render_status_bar(f, chunks[3], state);
}

// ---------------------------------------------------------------------------
// Title bar
// ---------------------------------------------------------------------------

fn render_title_bar(f: &mut Frame, area: Rect, state: &AppState) {
    let title = if let Some(ref config) = state.config {
        format!(" SSS Dashboard  --  {} ({}) ", config.name, config.symbol)
    } else {
        " SSS Dashboard  --  Loading... ".to_string()
    };
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(ACCENT));
    let text = Paragraph::new(Span::styled(
        title,
        Style::default().fg(ACCENT).add_modifier(Modifier::BOLD),
    ))
    .alignment(Alignment::Center)
    .block(block);
    f.render_widget(text, area);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

fn render_tabs(f: &mut Frame, area: Rect, state: &AppState) {
    let titles = vec![
        "Overview",
        "Supply",
        "Roles",
        "Minters",
        "Blacklist",
        "Attestations",
        "Activity",
    ];
    let tabs = Tabs::new(titles)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Tabs "),
        )
        .select(state.tab)
        .style(Style::default().fg(MUTED))
        .highlight_style(
            Style::default()
                .fg(ACCENT)
                .add_modifier(Modifier::BOLD)
                .add_modifier(Modifier::UNDERLINED),
        )
        .divider(Span::styled(" | ", Style::default().fg(MUTED)));
    f.render_widget(tabs, area);
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

fn render_status_bar(f: &mut Frame, area: Rect, state: &AppState) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(MUTED));

    if let Some(ref err) = state.error {
        let line = Line::from(vec![
            Span::styled(" [Error] ", Style::default().fg(DANGER).bold()),
            Span::styled(err.as_str(), Style::default().fg(DANGER)),
        ]);
        f.render_widget(Paragraph::new(line).block(block), area);
        return;
    }

    let search_indicator = if state.search_mode {
        Span::styled(
            format!(" [Search: {}] |", state.search_query),
            Style::default().fg(WARNING).bold(),
        )
    } else {
        Span::raw("")
    };

    let line = Line::from(vec![
        Span::styled(" [Connected]", Style::default().fg(SUCCESS).bold()),
        Span::styled(" | ", Style::default().fg(MUTED)),
        Span::styled(
            format!("Block: {}", format_number(state.block_height)),
            Style::default().fg(Color::White),
        ),
        Span::styled(" | ", Style::default().fg(MUTED)),
        Span::styled(
            format!("Next: {}s", state.refresh_countdown()),
            Style::default().fg(ACCENT),
        ),
        Span::styled(" | ", Style::default().fg(MUTED)),
        Span::styled(
            format!("Tab {}/{}", state.tab + 1, TAB_COUNT),
            Style::default().fg(Color::White),
        ),
        Span::styled(" | ", Style::default().fg(MUTED)),
        search_indicator,
        Span::styled(
            " q:Quit  r:Refresh  /:Search  Tab:Next ",
            Style::default().fg(MUTED),
        ),
    ]);
    f.render_widget(Paragraph::new(line).block(block), area);
}

// ---------------------------------------------------------------------------
// Tab 0: Overview (2x2 grid)
// ---------------------------------------------------------------------------

fn render_overview(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            " Overview ",
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.config.is_none() {
        f.render_widget(
            Paragraph::new("Loading stablecoin data...")
                .alignment(Alignment::Center)
                .style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }
    let config = state.config.as_ref().unwrap();

    // 2x2 grid
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(inner);
    let top = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(rows[0]);
    let bot = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(rows[1]);

    // -- Top-left: Identity card --
    {
        let block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Identity ", Style::default().fg(ACCENT)));

        let paused_badge = if config.is_paused {
            Span::styled(" PAUSED ", Style::default().fg(Color::White).bg(DANGER).bold())
        } else {
            Span::styled(" LIVE ", Style::default().fg(Color::White).bg(SUCCESS).bold())
        };

        let lines = vec![
            Line::from(vec![
                Span::styled("  Name:    ", Style::default().fg(MUTED)),
                Span::styled(&config.name, Style::default().fg(Color::White).bold()),
            ]),
            Line::from(vec![
                Span::styled("  Symbol:  ", Style::default().fg(MUTED)),
                Span::styled(&config.symbol, Style::default().fg(ACCENT).bold()),
            ]),
            Line::from(vec![
                Span::styled("  Mint:    ", Style::default().fg(MUTED)),
                Span::styled(
                    fmt_pubkey(&config.mint),
                    Style::default().fg(Color::White),
                ),
            ]),
            Line::from(vec![
                Span::styled("  Preset:  ", Style::default().fg(MUTED)),
                Span::styled(preset_name(config), Style::default().fg(WARNING)),
            ]),
            Line::from(vec![
                Span::styled("  Status:  ", Style::default().fg(MUTED)),
                paused_badge,
            ]),
        ];
        f.render_widget(Paragraph::new(lines).block(block), top[0]);
    }

    // -- Top-right: Supply gauge --
    {
        let block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Supply ", Style::default().fg(ACCENT)));

        let supply_str = fmt_amount(state.supply, config.decimals);
        let max_val = std::cmp::max(config.total_minted, 1);
        let ratio = (state.supply as f64 / max_val as f64).clamp(0.0, 1.0);

        let inner_area = block.inner(top[1]);
        f.render_widget(block, top[1]);

        if inner_area.height >= 4 {
            let sub = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Length(2),
                    Constraint::Length(1),
                    Constraint::Min(1),
                ])
                .split(inner_area);

            let big_supply = Paragraph::new(Line::from(vec![
                Span::styled("  ", Style::default()),
                Span::styled(
                    &supply_str,
                    Style::default()
                        .fg(SUCCESS)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    format!(" {}", config.symbol),
                    Style::default().fg(MUTED),
                ),
            ]));
            f.render_widget(big_supply, sub[0]);

            let gauge = Gauge::default()
                .gauge_style(Style::default().fg(ACCENT).bg(Color::DarkGray))
                .ratio(ratio)
                .label(Span::styled(
                    format!("{:.1}% of minted", ratio * 100.0),
                    Style::default().fg(Color::White),
                ));
            f.render_widget(gauge, sub[2]);
        }
    }

    // -- Bottom-left: Feature flags --
    {
        let block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Features ", Style::default().fg(ACCENT)));

        let flag = |name: &str, enabled: bool| -> Line {
            let badge = if enabled {
                Span::styled(
                    " ON  ",
                    Style::default().fg(Color::White).bg(SUCCESS).bold(),
                )
            } else {
                Span::styled(
                    " OFF ",
                    Style::default().fg(Color::White).bg(MUTED).bold(),
                )
            };
            Line::from(vec![
                Span::styled(format!("  {:<26}", name), Style::default().fg(Color::White)),
                badge,
            ])
        };

        let lines = vec![
            flag("Permanent Delegate", config.enable_permanent_delegate),
            flag("Transfer Hook", config.enable_transfer_hook),
            flag("Default Frozen", config.default_account_frozen),
            flag("Confidential Transfers", config.enable_confidential_transfers),
        ];
        f.render_widget(Paragraph::new(lines).block(block), bot[0]);
    }

    // -- Bottom-right: Quick stats --
    {
        let block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Stats ", Style::default().fg(ACCENT)));

        let lines = vec![
            Line::from(vec![
                Span::styled("  Minters:       ", Style::default().fg(MUTED)),
                Span::styled(
                    state.minters.len().to_string(),
                    Style::default().fg(Color::White).bold(),
                ),
            ]),
            Line::from(vec![
                Span::styled("  Blacklisted:   ", Style::default().fg(MUTED)),
                Span::styled(
                    state.blacklist_entries.len().to_string(),
                    Style::default().fg(DANGER).bold(),
                ),
            ]),
            Line::from(vec![
                Span::styled("  Attestations:  ", Style::default().fg(MUTED)),
                Span::styled(
                    config.reserve_attestation_index.to_string(),
                    Style::default().fg(Color::White).bold(),
                ),
            ]),
            Line::from(vec![
                Span::styled("  Decimals:      ", Style::default().fg(MUTED)),
                Span::styled(
                    config.decimals.to_string(),
                    Style::default().fg(Color::White),
                ),
            ]),
        ];
        f.render_widget(Paragraph::new(lines).block(block), bot[1]);
    }
}

// ---------------------------------------------------------------------------
// Tab 1: Supply Analytics
// ---------------------------------------------------------------------------

fn render_supply_analytics(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            " Supply Analytics ",
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.config.is_none() {
        f.render_widget(
            Paragraph::new("Loading supply data...").style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }
    let config = state.config.as_ref().unwrap();

    let minted = config.total_minted;
    let burned = config.total_burned;
    let supply = minted.saturating_sub(burned);
    let burn_rate = if minted > 0 {
        burned as f64 / minted as f64 * 100.0
    } else {
        0.0
    };

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(5), // Summary numbers
            Constraint::Length(1), // Spacer
            Constraint::Min(6),   // Sparkline + BarChart
            Constraint::Length(2), // Burn rate
        ])
        .split(inner);

    // -- Summary row: big colored numbers --
    {
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([
                Constraint::Percentage(33),
                Constraint::Percentage(34),
                Constraint::Percentage(33),
            ])
            .split(sections[0]);

        let minted_block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Minted ", Style::default().fg(ACCENT)));
        let minted_text = Paragraph::new(vec![
            Line::from(""),
            Line::from(Span::styled(
                format!("  {}", fmt_amount(minted, config.decimals)),
                Style::default().fg(ACCENT).bold(),
            )),
        ])
        .block(minted_block);
        f.render_widget(minted_text, cols[0]);

        let burned_block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Burned ", Style::default().fg(DANGER)));
        let burned_text = Paragraph::new(vec![
            Line::from(""),
            Line::from(Span::styled(
                format!("  {}", fmt_amount(burned, config.decimals)),
                Style::default().fg(DANGER).bold(),
            )),
        ])
        .block(burned_block);
        f.render_widget(burned_text, cols[1]);

        let current_block = Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(Span::styled(" Current ", Style::default().fg(SUCCESS)));
        let current_text = Paragraph::new(vec![
            Line::from(""),
            Line::from(Span::styled(
                format!("  {}", fmt_amount(supply, config.decimals)),
                Style::default().fg(SUCCESS).bold(),
            )),
        ])
        .block(current_block);
        f.render_widget(current_text, cols[2]);
    }

    // -- Sparkline + BarChart --
    {
        let halves = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
            .split(sections[2]);

        // Sparkline
        let history: Vec<u64> = state.supply_history.iter().copied().collect();
        let sparkline = Sparkline::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded)
                    .title(Span::styled(
                        " Supply History (5m window) ",
                        Style::default().fg(ACCENT),
                    )),
            )
            .data(&history)
            .style(Style::default().fg(ACCENT));
        f.render_widget(sparkline, halves[0]);

        // BarChart
        let bar_data: Vec<Bar> = vec![
            Bar::default()
                .value(minted)
                .label("Minted".into())
                .style(Style::default().fg(ACCENT)),
            Bar::default()
                .value(burned)
                .label("Burned".into())
                .style(Style::default().fg(DANGER)),
            Bar::default()
                .value(supply)
                .label("Current".into())
                .style(Style::default().fg(SUCCESS)),
        ];
        let bar_group = BarGroup::default().bars(&bar_data);
        let barchart = BarChart::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded)
                    .title(Span::styled(
                        " Distribution ",
                        Style::default().fg(ACCENT),
                    )),
            )
            .data(bar_group)
            .bar_width(7)
            .bar_gap(2)
            .value_style(Style::default().fg(Color::White).bold())
            .label_style(Style::default().fg(Color::White));
        f.render_widget(barchart, halves[1]);
    }

    // -- Burn rate --
    {
        let line = Line::from(vec![
            Span::styled("  Burn Rate: ", Style::default().fg(MUTED)),
            Span::styled(
                format!("{:.2}%", burn_rate),
                Style::default()
                    .fg(if burn_rate > 50.0 { DANGER } else { WARNING })
                    .bold(),
            ),
            Span::styled(
                format!(
                    "  |  Supply History Points: {}",
                    state.supply_history.len()
                ),
                Style::default().fg(MUTED),
            ),
        ]);
        f.render_widget(Paragraph::new(line), sections[3]);
    }
}

// ---------------------------------------------------------------------------
// Tab 2: Roles & Access
// ---------------------------------------------------------------------------

fn render_roles(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            " Roles & Access ",
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.roles.is_none() {
        f.render_widget(
            Paragraph::new("Loading role data...").style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }
    let roles = state.roles.as_ref().unwrap();

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(8), Constraint::Length(5)])
        .split(inner);

    // Role table
    let role_entries: Vec<(&str, &Pubkey, Color)> = vec![
        ("Master", &roles.master_authority, WARNING),
        ("Pauser", &roles.pauser, Color::Blue),
        ("Blacklister", &roles.blacklister, DANGER),
        ("Seizer", &roles.seizer, Color::Magenta),
    ];

    let header = Row::new(vec![
        Cell::from(Span::styled("Role", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Address", Style::default().fg(ACCENT).bold())),
    ])
    .height(1)
    .bottom_margin(1);

    let rows: Vec<Row> = role_entries
        .iter()
        .map(|(name, pk, color)| {
            let badge = Span::styled(
                format!(" {} ", name),
                Style::default().fg(Color::Black).bg(*color).bold(),
            );
            let (addr_str, addr_style) = fmt_pubkey_or_unset(pk);
            Row::new(vec![
                Cell::from(Line::from(badge)),
                Cell::from(Span::styled(addr_str, addr_style)),
            ])
            .height(1)
            .bottom_margin(1)
        })
        .collect();

    let table = Table::new(
        rows,
        [Constraint::Length(16), Constraint::Min(44)],
    )
    .header(header)
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(" Assigned Roles "),
    )
    .style(Style::default().fg(Color::White));
    f.render_widget(table, sections[0]);

    // Legend
    let legend_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(" Role Hierarchy ", Style::default().fg(MUTED)));
    let legend = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("  Master", Style::default().fg(WARNING).bold()),
            Span::styled(" > ", Style::default().fg(MUTED)),
            Span::styled("Pauser", Style::default().fg(Color::Blue)),
            Span::styled(" | ", Style::default().fg(MUTED)),
            Span::styled("Blacklister", Style::default().fg(DANGER)),
            Span::styled(" | ", Style::default().fg(MUTED)),
            Span::styled("Seizer", Style::default().fg(Color::Magenta)),
        ]),
        Line::from(Span::styled(
            "  Master authority inherits all subordinate roles",
            Style::default().fg(MUTED).italic(),
        )),
    ])
    .block(legend_block);
    f.render_widget(legend, sections[1]);
}

// ---------------------------------------------------------------------------
// Tab 3: Minters
// ---------------------------------------------------------------------------

fn render_minters(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            format!(" Minters ({}) ", state.minters.len()),
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.config.is_none() {
        f.render_widget(
            Paragraph::new("Loading...").style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }
    let config = state.config.as_ref().unwrap();

    if state.minters.is_empty() {
        f.render_widget(
            Paragraph::new("  No minters registered.")
                .style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }

    // Split: table + gauge area
    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(inner);

    // Table
    let header = Row::new(vec![
        Cell::from(Span::styled("Wallet", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Active", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Quota", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Used", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Remaining", Style::default().fg(ACCENT).bold())),
    ])
    .height(1)
    .bottom_margin(1);

    let visible_start = state.scroll_offset;
    let visible_count = sections[0].height.saturating_sub(4) as usize;
    let visible_end = std::cmp::min(visible_start + visible_count, state.minters.len());

    let rows: Vec<Row> = state.minters[visible_start..visible_end]
        .iter()
        .enumerate()
        .map(|(i, (_pk, info))| {
            let wallet = fmt_pubkey(&info.minter);
            let active_span = if info.is_active {
                Span::styled("YES", Style::default().fg(SUCCESS).bold())
            } else {
                Span::styled("NO", Style::default().fg(DANGER).bold())
            };
            let quota = if info.mint_quota == 0 {
                "Unlimited".to_string()
            } else {
                fmt_amount(info.mint_quota, config.decimals)
            };
            let used = fmt_amount(info.total_minted, config.decimals);
            let remaining = match info.remaining_quota() {
                None => "Unlimited".to_string(),
                Some(r) => fmt_amount(r, config.decimals),
            };

            let style = if (visible_start + i) == state.scroll_offset {
                Style::default().bg(Color::DarkGray)
            } else {
                Style::default()
            };

            Row::new(vec![
                Cell::from(wallet),
                Cell::from(Line::from(active_span)),
                Cell::from(quota),
                Cell::from(used),
                Cell::from(remaining),
            ])
            .style(style)
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(14),
            Constraint::Length(8),
            Constraint::Length(18),
            Constraint::Length(18),
            Constraint::Min(18),
        ],
    )
    .header(header)
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(format!(
                " {} / {} ",
                state.scroll_offset + 1,
                state.minters.len()
            )),
    );
    f.render_widget(table, sections[0]);

    // Gauge area: show quota usage per minter (up to what fits)
    let gauge_block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            " Quota Usage ",
            Style::default().fg(ACCENT),
        ));
    let gauge_inner = gauge_block.inner(sections[1]);
    f.render_widget(gauge_block, sections[1]);

    let gauge_count = std::cmp::min(state.minters.len(), gauge_inner.height as usize);
    if gauge_count > 0 {
        let gauge_constraints: Vec<Constraint> =
            (0..gauge_count).map(|_| Constraint::Length(1)).collect();
        let gauge_rows = Layout::default()
            .direction(Direction::Vertical)
            .constraints(gauge_constraints)
            .split(gauge_inner);

        for (i, (_pk, info)) in state.minters.iter().take(gauge_count).enumerate() {
            let ratio = if info.mint_quota == 0 {
                0.0 // unlimited => show as 0%
            } else if info.mint_quota > 0 {
                (info.total_minted as f64 / info.mint_quota as f64).clamp(0.0, 1.0)
            } else {
                0.0
            };

            let color = if ratio > 0.9 {
                DANGER
            } else if ratio > 0.7 {
                WARNING
            } else {
                SUCCESS
            };

            let label_text = format!(
                "{}: {:.0}%",
                fmt_pubkey(&info.minter),
                ratio * 100.0
            );
            let gauge = LineGauge::default()
                .filled_style(Style::default().fg(color))
                .ratio(ratio)
                .label(Span::styled(label_text, Style::default().fg(Color::White)))
                .line_set(symbols::line::THICK);
            f.render_widget(gauge, gauge_rows[i]);
        }
    }
}

// ---------------------------------------------------------------------------
// Tab 4: Blacklist
// ---------------------------------------------------------------------------

fn render_blacklist(f: &mut Frame, area: Rect, state: &AppState) {
    let filtered = state.filtered_blacklist();
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            format!(
                " Blacklist ({}{}) ",
                filtered.len(),
                if !state.search_query.is_empty() {
                    format!(" matching \"{}\"", state.search_query)
                } else {
                    String::new()
                }
            ),
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if filtered.is_empty() {
        let msg = if state.search_query.is_empty() {
            "  No blacklisted addresses."
        } else {
            "  No matching entries. Press Esc to clear search."
        };
        f.render_widget(
            Paragraph::new(msg).style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }

    let header = Row::new(vec![
        Cell::from(Span::styled("Address", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Reason", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled(
            "Blacklisted By",
            Style::default().fg(ACCENT).bold(),
        )),
    ])
    .height(1)
    .bottom_margin(1);

    let visible_start = state.scroll_offset;
    let visible_count = inner.height.saturating_sub(4) as usize;
    let visible_end = std::cmp::min(visible_start + visible_count, filtered.len());

    let rows: Vec<Row> = filtered[visible_start..visible_end]
        .iter()
        .enumerate()
        .map(|(i, (_pk, entry))| {
            let style = if (visible_start + i) == state.scroll_offset {
                Style::default().bg(Color::DarkGray)
            } else {
                Style::default()
            };
            Row::new(vec![
                Cell::from(Span::styled(
                    entry.blocked_address.to_string(),
                    Style::default().fg(DANGER),
                )),
                Cell::from(entry.reason.clone()),
                Cell::from(fmt_pubkey(&entry.blacklisted_by)),
            ])
            .style(style)
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(46),
            Constraint::Percentage(40),
            Constraint::Min(14),
        ],
    )
    .header(header)
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(format!(
                " {}/{} | /:Search ",
                if filtered.is_empty() {
                    0
                } else {
                    state.scroll_offset + 1
                },
                filtered.len()
            )),
    );
    f.render_widget(table, inner);
}

// ---------------------------------------------------------------------------
// Tab 5: Attestations
// ---------------------------------------------------------------------------

fn render_attestations(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            format!(" Reserve Attestations ({}) ", state.attestations.len()),
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.config.is_none() {
        f.render_widget(
            Paragraph::new("Loading...").style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }
    let config = state.config.as_ref().unwrap();

    if state.attestations.is_empty() {
        f.render_widget(
            Paragraph::new("  No attestations submitted yet.")
                .style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(6), Constraint::Length(3)])
        .split(inner);

    let header = Row::new(vec![
        Cell::from(Span::styled("Idx", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Hash", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled(
            "Reserves (USD)",
            Style::default().fg(ACCENT).bold(),
        )),
        Cell::from(Span::styled(
            "Outstanding",
            Style::default().fg(ACCENT).bold(),
        )),
        Cell::from(Span::styled(
            "Coll. Ratio",
            Style::default().fg(ACCENT).bold(),
        )),
        Cell::from(Span::styled("URI", Style::default().fg(ACCENT).bold())),
    ])
    .height(1)
    .bottom_margin(1);

    let visible_start = state.scroll_offset;
    let visible_count = sections[0].height.saturating_sub(4) as usize;
    let visible_end = std::cmp::min(visible_start + visible_count, state.attestations.len());

    let rows: Vec<Row> = state.attestations[visible_start..visible_end]
        .iter()
        .enumerate()
        .map(|(i, att)| {
            let ratio = if att.total_outstanding > 0 {
                att.total_reserves_usd as f64 / att.total_outstanding as f64
            } else {
                0.0
            };
            let ratio_color = if ratio >= 1.0 {
                SUCCESS
            } else if ratio >= 0.9 {
                WARNING
            } else {
                DANGER
            };

            let uri_display = if att.attestation_uri.len() > 30 {
                format!("{}...", &att.attestation_uri[..27])
            } else {
                att.attestation_uri.clone()
            };

            let style = if (visible_start + i) == state.scroll_offset {
                Style::default().bg(Color::DarkGray)
            } else {
                Style::default()
            };

            Row::new(vec![
                Cell::from(att.index.to_string()),
                Cell::from(hex_short(&att.reserve_hash)),
                Cell::from(Span::styled(
                    fmt_amount(att.total_reserves_usd, 2),
                    Style::default().fg(SUCCESS),
                )),
                Cell::from(fmt_amount(att.total_outstanding, config.decimals)),
                Cell::from(Span::styled(
                    format!("{:.2}%", ratio * 100.0),
                    Style::default().fg(ratio_color).bold(),
                )),
                Cell::from(uri_display),
            ])
            .style(style)
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(5),
            Constraint::Length(20),
            Constraint::Length(16),
            Constraint::Length(16),
            Constraint::Length(12),
            Constraint::Min(20),
        ],
    )
    .header(header)
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(format!(
                " {}/{} ",
                if state.attestations.is_empty() {
                    0
                } else {
                    state.scroll_offset + 1
                },
                state.attestations.len()
            )),
    );
    f.render_widget(table, sections[0]);

    // Collateralization summary
    if let Some(latest) = state.attestations.first() {
        let ratio = if latest.total_outstanding > 0 {
            latest.total_reserves_usd as f64 / latest.total_outstanding as f64
        } else {
            0.0
        };
        let ratio_color = if ratio >= 1.0 { SUCCESS } else { DANGER };

        let summary = Paragraph::new(Line::from(vec![
            Span::styled("  Latest Collateralization: ", Style::default().fg(MUTED)),
            Span::styled(
                format!("{:.2}%", ratio * 100.0),
                Style::default().fg(ratio_color).bold(),
            ),
            Span::styled(
                format!(
                    "  |  Reserves: ${}  |  Outstanding: {}",
                    fmt_amount(latest.total_reserves_usd, 2),
                    fmt_amount(latest.total_outstanding, config.decimals)
                ),
                Style::default().fg(MUTED),
            ),
        ]))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded),
        );
        f.render_widget(summary, sections[1]);
    }
}

// ---------------------------------------------------------------------------
// Tab 6: Activity Log
// ---------------------------------------------------------------------------

fn render_activity_log(f: &mut Frame, area: Rect, state: &AppState) {
    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            format!(" Activity Log ({}) ", state.signatures.len()),
            Style::default().fg(ACCENT).bold(),
        ));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    if state.signatures.is_empty() {
        f.render_widget(
            Paragraph::new("  No recent transactions found.")
                .style(Style::default().fg(MUTED)),
            inner,
        );
        return;
    }

    let sections = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(6), Constraint::Length(3)])
        .split(inner);

    let header = Row::new(vec![
        Cell::from(Span::styled(
            "Signature",
            Style::default().fg(ACCENT).bold(),
        )),
        Cell::from(Span::styled("Slot", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Status", Style::default().fg(ACCENT).bold())),
        Cell::from(Span::styled("Time", Style::default().fg(ACCENT).bold())),
    ])
    .height(1)
    .bottom_margin(1);

    let visible_start = state.scroll_offset;
    let visible_count = sections[0].height.saturating_sub(4) as usize;
    let visible_end = std::cmp::min(visible_start + visible_count, state.signatures.len());

    let rows: Vec<Row> = state.signatures[visible_start..visible_end]
        .iter()
        .enumerate()
        .map(|(i, sig)| {
            let sig_display = if sig.signature.len() > 20 {
                format!("{}...{}", &sig.signature[..10], &sig.signature[sig.signature.len() - 6..])
            } else {
                sig.signature.clone()
            };

            let status = if sig.err.is_some() {
                Span::styled("FAILED", Style::default().fg(DANGER).bold())
            } else {
                Span::styled("OK", Style::default().fg(SUCCESS).bold())
            };

            let time_display = sig
                .block_time
                .map(|t| {
                    let secs_ago = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64 - t)
                        .unwrap_or(0);
                    if secs_ago < 60 {
                        format!("{}s ago", secs_ago)
                    } else if secs_ago < 3600 {
                        format!("{}m ago", secs_ago / 60)
                    } else if secs_ago < 86400 {
                        format!("{}h ago", secs_ago / 3600)
                    } else {
                        format!("{}d ago", secs_ago / 86400)
                    }
                })
                .unwrap_or_else(|| "---".to_string());

            let style = if (visible_start + i) == state.scroll_offset {
                Style::default().bg(Color::DarkGray)
            } else {
                Style::default()
            };

            Row::new(vec![
                Cell::from(Span::styled(sig_display, Style::default().fg(Color::White))),
                Cell::from(format_number(sig.slot)),
                Cell::from(Line::from(status)),
                Cell::from(time_display),
            ])
            .style(style)
        })
        .collect();

    let table = Table::new(
        rows,
        [
            Constraint::Length(22),
            Constraint::Length(14),
            Constraint::Length(10),
            Constraint::Min(10),
        ],
    )
    .header(header)
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(format!(
                " {}/{} | Enter: select | Up/Down: scroll ",
                if state.signatures.is_empty() {
                    0
                } else {
                    state.scroll_offset + 1
                },
                state.signatures.len()
            )),
    );
    f.render_widget(table, sections[0]);

    // Explorer link for selected item
    let explorer_text = if state.selected_item < state.signatures.len() {
        let sig = &state.signatures[state.selected_item].signature;
        format!(
            "  Explorer: https://explorer.solana.com/tx/{}",
            sig
        )
    } else {
        "  Press Enter on a transaction to view explorer link".to_string()
    };

    let explorer_bar = Paragraph::new(Span::styled(
        explorer_text,
        Style::default().fg(ACCENT),
    ))
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded),
    );
    f.render_widget(explorer_bar, sections[1]);
}
