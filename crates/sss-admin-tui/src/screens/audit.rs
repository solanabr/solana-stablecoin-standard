use ratatui::{prelude::*, widgets::*};

use crate::services::audit::AuditViewModel;

pub fn render(frame: &mut Frame, area: Rect, audit: &Result<AuditViewModel, String>) {
    match audit {
        Ok(view) => render_ready(frame, area, view),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, view: &AuditViewModel) {
    let layout = Layout::vertical([Constraint::Length(3), Constraint::Min(10)]).split(area);
    frame.render_widget(
        Paragraph::new(format!(
            "mint [{}] event filter [{}]",
            view.mint, view.event_type_filter
        ))
        .block(Block::default().borders(Borders::ALL).title("Filters"))
        .style(Style::default().fg(Color::Cyan)),
        layout[0],
    );

    let header = Row::new(vec!["Event", "Slot", "Signature", "Time"])
        .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    let rows = view.rows.iter().map(|row| {
        Row::new(vec![
            row.event_type.clone(),
            row.slot.clone(),
            row.signature.clone(),
            row.timestamp.clone(),
        ])
    });
    frame.render_widget(
        Table::new(
            rows,
            [
                Constraint::Length(22),
                Constraint::Length(12),
                Constraint::Percentage(44),
                Constraint::Percentage(24),
            ],
        )
        .header(header)
        .block(Block::default().borders(Borders::ALL).title("Events"))
        .column_spacing(1),
        layout[1],
    );
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    frame.render_widget(
        Paragraph::new(error)
            .block(Block::default().borders(Borders::ALL).title("Audit Error"))
            .style(Style::default().fg(Color::Red))
            .wrap(Wrap { trim: true }),
        area,
    );
}
