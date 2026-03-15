use ratatui::{prelude::*, widgets::*};

use crate::{
    runtime::RuntimeState,
    services::overview::{HolderRow, OverviewViewModel},
    ui::widgets::summary_block,
};

pub fn render(
    frame: &mut Frame,
    area: Rect,
    runtime: &RuntimeState,
    overview: &Result<OverviewViewModel, String>,
) {
    match overview {
        Ok(view) => render_ready(frame, area, runtime, view),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, runtime: &RuntimeState, overview: &OverviewViewModel) {
    let layout = Layout::vertical([
        Constraint::Length(7),
        Constraint::Length(11),
        Constraint::Min(10),
    ])
    .split(area);

    render_summary(frame, layout[0], overview);
    render_details(frame, layout[1], runtime, overview);
    render_holders(frame, layout[2], &overview.holders);
}

fn render_summary(frame: &mut Frame, area: Rect, overview: &OverviewViewModel) {
    let sections = Layout::horizontal([
        Constraint::Percentage(16),
        Constraint::Percentage(16),
        Constraint::Percentage(16),
        Constraint::Percentage(17),
        Constraint::Percentage(17),
        Constraint::Percentage(18),
    ])
    .split(area);

    let cards = [
        ("Preset", overview.preset.as_str()),
        ("Paused", overview.paused_label.as_str()),
        ("Supply", overview.supply.as_str()),
        ("Minted", overview.total_minted.as_str()),
        ("Burned", overview.total_burned.as_str()),
        ("Holders", overview.holder_count.as_str()),
    ];

    for (index, (title, value)) in cards.iter().enumerate() {
        frame.render_widget(summary_block(title, value), sections[index]);
    }
}

fn render_details(frame: &mut Frame, area: Rect, runtime: &RuntimeState, overview: &OverviewViewModel) {
    let columns = Layout::horizontal([Constraint::Percentage(34), Constraint::Percentage(33), Constraint::Percentage(33)])
        .split(area);

    let metadata = Paragraph::new(vec![
        Line::from(format!("Mint: {}", overview.mint)),
        Line::from(format!("Name: {}", overview.name)),
        Line::from(format!("Symbol: {}", overview.symbol)),
        Line::from(format!("Decimals: {}", overview.decimals)),
        Line::from(format!("URI: {}", overview.uri)),
    ])
    .block(Block::default().borders(Borders::ALL).title("Metadata"))
    .wrap(Wrap { trim: true });

    let features = Paragraph::new(vec![
        Line::from(format!("Permanent delegate: {}", overview.permanent_delegate)),
        Line::from(format!("Transfer hook: {}", overview.transfer_hook)),
        Line::from(format!("Frozen by default: {}", overview.default_frozen)),
        Line::from(""),
        Line::from(format!("Master: {}", overview.roles.master_authority)),
        Line::from(format!("Pauser: {}", overview.roles.pauser)),
        Line::from(format!("Burner: {}", overview.roles.burner)),
        Line::from(format!("Blacklister: {}", overview.roles.blacklister)),
        Line::from(format!("Seizer: {}", overview.roles.seizer)),
    ])
    .block(Block::default().borders(Borders::ALL).title("Features & Roles"))
    .wrap(Wrap { trim: true });

    let runtime_lines = match runtime {
        RuntimeState::Ready(runtime) => vec![
            Line::from(format!("Config preset: {:?}", runtime.config().preset)),
            Line::from(format!("Runtime mint: {}", runtime.mint())),
            Line::from(format!("RPC: {}", runtime.rpc_url())),
            Line::from(format!(
                "API: {}",
                runtime.api_url().unwrap_or("missing")
            )),
            Line::from(format!("Authority keypair: {}", overview.authority_ready)),
            Line::from(format!("Chain read status: {}", overview.chain_status)),
            Line::from(format!("Backend status: {}", overview.backend_status)),
        ],
        RuntimeState::Error(error) => vec![Line::from(error.clone())],
    };

    let runtime_widget = Paragraph::new(runtime_lines)
        .block(Block::default().borders(Borders::ALL).title("Runtime Health"))
        .wrap(Wrap { trim: true });

    frame.render_widget(metadata, columns[0]);
    frame.render_widget(features, columns[1]);
    frame.render_widget(runtime_widget, columns[2]);
}

fn render_holders(frame: &mut Frame, area: Rect, holders: &[HolderRow]) {
    let header = Row::new(vec!["Owner", "Token Account", "Balance", "% Supply"])
        .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    let rows = holders.iter().map(|holder| {
        Row::new(vec![
            holder.owner.clone(),
            holder.token_account.clone(),
            holder.balance.clone(),
            holder.percent_of_supply.clone(),
        ])
    });

    let table = Table::new(
        rows,
        [
            Constraint::Percentage(26),
            Constraint::Percentage(28),
            Constraint::Percentage(24),
            Constraint::Percentage(22),
        ],
    )
    .header(header)
    .block(Block::default().borders(Borders::ALL).title("Top Holders"))
    .column_spacing(1)
    .row_highlight_style(Style::default().add_modifier(Modifier::REVERSED));

    frame.render_widget(table, area);
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    let widget = Paragraph::new(error)
        .block(Block::default().borders(Borders::ALL).title("Startup Error"))
        .wrap(Wrap { trim: true })
        .style(Style::default().fg(Color::Red));
    frame.render_widget(widget, area);
}
