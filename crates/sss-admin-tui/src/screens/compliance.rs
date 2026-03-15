use ratatui::{prelude::*, widgets::*};

use crate::app::{
    BlacklistAddFormState, ComplianceModal, ComplianceScreenState, OperationFormField, SeizeFormState,
    SingleInputFormState,
};

pub fn render(
    frame: &mut Frame,
    area: Rect,
    compliance: &Result<ComplianceScreenState, String>,
) {
    match compliance {
        Ok(state) => render_ready(frame, area, state),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, state: &ComplianceScreenState) {
    let layout = Layout::vertical([Constraint::Length(8), Constraint::Min(10)]).split(area);
    let info = Paragraph::new(vec![
        Line::from(format!("Mint: {}", state.view.mint)),
        Line::from(format!("State: {}", state.view.paused_label)),
        Line::from(format!("Transfer hook: {}", state.view.transfer_hook)),
        Line::from(format!("Default frozen: {}", state.view.default_frozen)),
        Line::from(format!("Pauser: {}", state.view.pauser)),
        Line::from(format!("Blacklister: {}", state.view.blacklister)),
        Line::from(format!("Seizer: {}", state.view.seizer)),
    ])
    .block(Block::default().borders(Borders::ALL).title("Compliance Status"))
    .wrap(Wrap { trim: true });

    let actions = Paragraph::new(vec![
        Line::from("p: pause/unpause mint"),
        Line::from("f: freeze token account"),
        Line::from("t: thaw token account"),
        Line::from("a: blacklist add wallet"),
        Line::from("x: blacklist remove wallet"),
        Line::from("s: seize tokens (from -> to)"),
        Line::from("r: refresh"),
    ])
    .block(Block::default().borders(Borders::ALL).title("Actions"))
    .wrap(Wrap { trim: true });

    frame.render_widget(info, layout[0]);
    frame.render_widget(actions, layout[1]);

    if let Some(modal) = &state.modal {
        render_modal(frame, area, modal);
    }
}

fn render_modal(frame: &mut Frame, area: Rect, modal: &ComplianceModal) {
    let popup = centered_rect(62, 48, area);
    frame.render_widget(Clear, popup);
    match modal {
        ComplianceModal::Confirm {
            title,
            summary,
            confirm_hint,
            ..
        } => {
            let widget = Paragraph::new(vec![
                Line::from(title.as_str()),
                Line::from(""),
                Line::from(summary.as_str()),
                Line::from(""),
                Line::from(confirm_hint.as_str()),
            ])
            .block(Block::default().borders(Borders::ALL).title("Confirm"))
            .wrap(Wrap { trim: true });
            frame.render_widget(widget, popup);
        }
        ComplianceModal::FreezeForm(form) => {
            render_single_form(frame, popup, "Freeze Token Account", "Token account", form)
        }
        ComplianceModal::ThawForm(form) => {
            render_single_form(frame, popup, "Thaw Token Account", "Token account", form)
        }
        ComplianceModal::BlacklistRemoveForm(form) => {
            render_single_form(frame, popup, "Remove From Blacklist", "Wallet", form)
        }
        ComplianceModal::BlacklistAddForm(form) => render_blacklist_add_form(frame, popup, form),
        ComplianceModal::SeizeForm(form) => render_seize_form(frame, popup, form),
    }
}

fn render_single_form(
    frame: &mut Frame,
    area: Rect,
    title: &str,
    label: &str,
    form: &SingleInputFormState,
) {
    let widget = Paragraph::new(vec![
        Line::from(format!("> {label}: {}", form.value)),
        Line::from(""),
        Line::from("Type to edit, Enter submits, Esc cancels."),
    ])
    .block(Block::default().borders(Borders::ALL).title(title))
    .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn render_blacklist_add_form(frame: &mut Frame, area: Rect, form: &BlacklistAddFormState) {
    let marker_wallet = marker(form.active_field, OperationFormField::First);
    let marker_reason = marker(form.active_field, OperationFormField::Second);
    let widget = Paragraph::new(vec![
        Line::from(format!("{marker_wallet} Wallet: {}", form.wallet)),
        Line::from(""),
        Line::from(format!("{marker_reason} Reason: {}", form.reason)),
        Line::from(""),
        Line::from("Tab switches fields, Enter submits, Esc cancels."),
    ])
    .block(Block::default().borders(Borders::ALL).title("Add To Blacklist"))
    .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn render_seize_form(frame: &mut Frame, area: Rect, form: &SeizeFormState) {
    let marker_from = marker(form.active_field, OperationFormField::First);
    let marker_to = marker(form.active_field, OperationFormField::Second);
    let marker_amount = marker(form.active_field, OperationFormField::Third);
    let widget = Paragraph::new(vec![
        Line::from(format!("{marker_from} Source token account: {}", form.from)),
        Line::from(""),
        Line::from(format!("{marker_to} Destination token account: {}", form.to)),
        Line::from(""),
        Line::from(format!("{marker_amount} Amount (optional): {}", form.amount)),
        Line::from(""),
        Line::from("Tab switches fields, Enter submits, Esc cancels."),
    ])
    .block(Block::default().borders(Borders::ALL).title("Seize Tokens"))
    .wrap(Wrap { trim: true });
    frame.render_widget(widget, area);
}

fn marker(active: OperationFormField, expected: OperationFormField) -> &'static str {
    if active.index() == expected.index() {
        ">"
    } else {
        " "
    }
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    let widget = Paragraph::new(error)
        .block(Block::default().borders(Borders::ALL).title("Compliance Error"))
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
