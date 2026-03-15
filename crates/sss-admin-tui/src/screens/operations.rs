use ratatui::{prelude::*, widgets::*};

use crate::{
    app::{OperationFormField, OperationModal, OperationScreenState},
    services::operations::OperationsViewModel,
};

pub fn render(
    frame: &mut Frame,
    area: Rect,
    operations: &Result<OperationScreenState, String>,
) {
    match operations {
        Ok(state) => render_ready(frame, area, state),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, state: &OperationScreenState) {
    let layout = Layout::vertical([Constraint::Length(3), Constraint::Min(12)]).split(area);
    let filters = Paragraph::new(format!(
        "status [{}]  type [{}]  total [{}]",
        state.view.status_filter,
        state.view.type_filter,
        state.requests.len()
    ))
    .block(Block::default().borders(Borders::ALL).title("Filters"))
    .style(Style::default().fg(Color::Cyan));
    frame.render_widget(filters, layout[0]);

    let content = Layout::horizontal([Constraint::Percentage(48), Constraint::Percentage(52)]).split(layout[1]);
    render_list(frame, content[0], state);
    render_detail(frame, content[1], &state.view);

    if let Some(modal) = &state.modal {
        render_modal(frame, area, modal);
    }
}

fn render_list(frame: &mut Frame, area: Rect, state: &OperationScreenState) {
    let header = Row::new(vec!["ID", "Type", "Status", "Amount", "Requester", "Updated"])
        .style(Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD));
    let rows = state.view.rows.iter().map(|row| {
        Row::new(vec![
            row.id.clone(),
            row.type_label.clone(),
            row.status_label.clone(),
            row.amount.clone(),
            row.requested_by.clone(),
            row.updated_at.clone(),
        ])
    });
    let table = Table::new(
        rows,
        [
            Constraint::Length(10),
            Constraint::Length(8),
            Constraint::Length(12),
            Constraint::Length(12),
            Constraint::Length(16),
            Constraint::Min(18),
        ],
    )
    .header(header)
    .block(Block::default().borders(Borders::ALL).title("Operations Queue"))
    .row_highlight_style(Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD))
    .highlight_symbol(">> ");
    let mut table_state = TableState::default().with_selected(state.selected());
    frame.render_stateful_widget(table, area, &mut table_state);
}

fn render_detail(frame: &mut Frame, area: Rect, view: &OperationsViewModel) {
    let detail = match &view.detail {
        Some(detail) => Paragraph::new(vec![
            Line::from(format!("ID: {}", detail.id)),
            Line::from(format!("Type: {}", detail.type_label)),
            Line::from(format!("Status: {}", detail.status_label)),
            Line::from(format!("Mint: {}", detail.mint)),
            Line::from(format!("Amount: {}", detail.amount)),
            Line::from(format!("Recipient: {}", detail.recipient)),
            Line::from(format!("Token account: {}", detail.token_account)),
            Line::from(format!("Reason: {}", detail.reason)),
            Line::from(format!("Requested by: {}", detail.requested_by)),
            Line::from(format!("Approved by: {}", detail.approved_by)),
            Line::from(format!("Tx signature: {}", detail.tx_signature)),
            Line::from(format!("Error: {}", detail.error)),
            Line::from(format!("Created: {}", detail.created_at)),
            Line::from(format!("Updated: {}", detail.updated_at)),
            Line::from(""),
            Line::from(format!("Backend: {}", view.backend_status)),
        ]),
        None => Paragraph::new("No operations matched the current filters."),
    };

    frame.render_widget(
        detail
            .block(Block::default().borders(Borders::ALL).title("Operation Detail"))
            .wrap(Wrap { trim: true }),
        area,
    );
}

fn render_modal(frame: &mut Frame, area: Rect, modal: &OperationModal) {
    let popup = centered_rect(60, 45, area);
    frame.render_widget(Clear, popup);

    match modal {
        OperationModal::Confirm {
            title,
            summary,
            confirm_hint,
            ..
        } => {
            let body = Paragraph::new(vec![
                Line::from(title.as_str()),
                Line::from(""),
                Line::from(summary.as_str()),
                Line::from(""),
                Line::from(confirm_hint.as_str()),
            ])
            .block(Block::default().borders(Borders::ALL).title("Confirm"))
            .wrap(Wrap { trim: true });
            frame.render_widget(body, popup);
        }
        OperationModal::MintForm(form) => {
            render_form(
                frame,
                popup,
                "Create Mint Request",
                &[
                    ("Recipient", &form.recipient),
                    ("Amount", &form.amount),
                    ("Reason", &form.reason),
                ],
                form.active_field,
            );
        }
        OperationModal::BurnForm(form) => {
            render_form(
                frame,
                popup,
                "Create Burn Request",
                &[
                    ("Token account", &form.account),
                    ("Amount", &form.amount),
                    ("Reason", &form.reason),
                ],
                form.active_field,
            );
        }
    }
}

fn render_form(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    fields: &[(&str, &str)],
    active_field: OperationFormField,
) {
    let lines = fields
        .iter()
        .enumerate()
        .flat_map(|(index, (label, value))| {
            let marker = if active_field.index() == index { ">" } else { " " };
            [
                Line::from(format!("{marker} {label}: {value}")),
                Line::from(""),
            ]
        })
        .chain([
            Line::from("Tab switches fields. Type to edit. Enter submits. Esc cancels."),
        ])
        .collect::<Vec<_>>();

    let widget = Paragraph::new(lines)
        .block(Block::default().borders(Borders::ALL).title(title))
        .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    let widget = Paragraph::new(error)
        .block(Block::default().borders(Borders::ALL).title("Operations Error"))
        .wrap(Wrap { trim: true })
        .style(Style::default().fg(Color::Red));
    frame.render_widget(widget, area);
}

fn centered_rect(horizontal_percent: u16, vertical_percent: u16, area: Rect) -> Rect {
    let vertical = Layout::vertical([
        Constraint::Percentage((100 - vertical_percent) / 2),
        Constraint::Percentage(vertical_percent),
        Constraint::Percentage((100 - vertical_percent) / 2),
    ])
    .split(area);

    Layout::horizontal([
        Constraint::Percentage((100 - horizontal_percent) / 2),
        Constraint::Percentage(horizontal_percent),
        Constraint::Percentage((100 - horizontal_percent) / 2),
    ])
    .split(vertical[1])[1]
}
