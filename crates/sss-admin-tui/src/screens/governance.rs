use ratatui::{prelude::*, widgets::*};

use crate::services::governance::GovernanceViewModel;

pub fn render(frame: &mut Frame, area: Rect, governance: &Result<GovernanceViewModel, String>) {
    match governance {
        Ok(view) => render_ready(frame, area, view),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, view: &GovernanceViewModel) {
    let layout = Layout::vertical([Constraint::Length(10), Constraint::Min(10)]).split(area);
    let roles = Paragraph::new(vec![
        Line::from(format!("Mint: {}", view.mint)),
        Line::from(format!("Master authority: {}", view.roles.master_authority)),
        Line::from(format!("Pauser: {}", view.roles.pauser)),
        Line::from(format!("Burner: {}", view.roles.burner)),
        Line::from(format!("Blacklister: {}", view.roles.blacklister)),
        Line::from(format!("Seizer: {}", view.roles.seizer)),
    ])
    .block(Block::default().borders(Borders::ALL).title("Roles"))
    .wrap(Wrap { trim: true });
    frame.render_widget(roles, layout[0]);

    let header = Row::new(vec!["Minter", "Quota", "Minted", "Active"])
        .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    let rows = view.minters.iter().map(|row| {
        Row::new(vec![
            row.minter.clone(),
            row.quota.clone(),
            row.minted.clone(),
            row.active.clone(),
        ])
    });
    let table = Table::new(
        rows,
        [
            Constraint::Percentage(50),
            Constraint::Percentage(20),
            Constraint::Percentage(20),
            Constraint::Percentage(10),
        ],
    )
    .header(header)
    .block(Block::default().borders(Borders::ALL).title("Minters"))
    .column_spacing(1);
    frame.render_widget(table, layout[1]);
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    frame.render_widget(
        Paragraph::new(error)
            .block(Block::default().borders(Borders::ALL).title("Governance Error"))
            .style(Style::default().fg(Color::Red))
            .wrap(Wrap { trim: true }),
        area,
    );
}
