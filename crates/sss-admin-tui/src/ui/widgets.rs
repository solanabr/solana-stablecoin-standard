use ratatui::{prelude::*, widgets::*};

pub fn summary_block<'a>(title: &'a str, value: &'a str) -> Paragraph<'a> {
    Paragraph::new(Line::from(vec![
        Span::styled(value, Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
    ]))
    .alignment(Alignment::Center)
    .block(Block::default().borders(Borders::ALL).title(title))
}
