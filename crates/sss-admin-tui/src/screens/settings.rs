use ratatui::{prelude::*, widgets::*};

use crate::services::settings::SettingsViewModel;

pub fn render(frame: &mut Frame, area: Rect, settings: &Result<SettingsViewModel, String>) {
    match settings {
        Ok(view) => render_ready(frame, area, view),
        Err(error) => render_error(frame, area, error),
    }
}

fn render_ready(frame: &mut Frame, area: Rect, view: &SettingsViewModel) {
    frame.render_widget(
        Paragraph::new(vec![
            Line::from(format!("Config path: {}", view.config_path)),
            Line::from(format!("Preset: {}", view.preset)),
            Line::from(format!("Mint: {}", view.mint)),
            Line::from(format!("RPC URL: {}", view.rpc_url)),
            Line::from(format!("API URL: {}", view.api_url)),
            Line::from(format!("Authority keypair: {}", view.authority_keypair)),
        ])
        .block(Block::default().borders(Borders::ALL).title("Resolved Runtime"))
        .wrap(Wrap { trim: true }),
        area,
    );
}

fn render_error(frame: &mut Frame, area: Rect, error: &str) {
    frame.render_widget(
        Paragraph::new(error)
            .block(Block::default().borders(Borders::ALL).title("Settings Error"))
            .style(Style::default().fg(Color::Red))
            .wrap(Wrap { trim: true }),
        area,
    );
}
