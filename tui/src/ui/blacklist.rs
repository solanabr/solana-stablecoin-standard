use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};

use crate::app::App;

/// Render the Blacklist tab: placeholder for address lookup.
pub fn draw(frame: &mut Frame, _app: &App, area: Rect) {
  let chunks = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
      Constraint::Length(7), // info section
      Constraint::Min(0),    // placeholder content
    ])
    .split(area);

  // -- Info Section --
  let info_block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::Blue))
    .title(Span::styled(
      " Blacklist Check ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  let info_lines = vec![
    Line::from(""),
    Line::from(vec![
      Span::styled(
        "  Check whether an address is blacklisted on the transfer hook.",
        Style::default().fg(Color::White),
      ),
    ]),
    Line::from(""),
    Line::from(vec![
      Span::styled("  Seeds: ", Style::default().fg(Color::DarkGray)),
      Span::styled(
        "[\"blacklist\", mint, address]",
        Style::default().fg(Color::Yellow),
      ),
    ]),
  ];

  frame.render_widget(Paragraph::new(info_lines).block(info_block), chunks[0]);

  // -- Placeholder --
  let placeholder_block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::DarkGray))
    .title(Span::styled(
      " Address Lookup ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  let placeholder_lines = vec![
    Line::from(""),
    Line::from(Span::styled(
      "  [Interactive input coming in a future update]",
      Style::default().fg(Color::DarkGray),
    )),
    Line::from(""),
    Line::from(vec![
      Span::styled("  How it works:", Style::default().fg(Color::White).add_modifier(Modifier::BOLD)),
    ]),
    Line::from(vec![
      Span::styled(
        "  1. Enter a wallet address",
        Style::default().fg(Color::DarkGray),
      ),
    ]),
    Line::from(vec![
      Span::styled(
        "  2. Derive the BlacklistEntry PDA",
        Style::default().fg(Color::DarkGray),
      ),
    ]),
    Line::from(vec![
      Span::styled(
        "  3. Check if the account exists on-chain",
        Style::default().fg(Color::DarkGray),
      ),
    ]),
    Line::from(vec![
      Span::styled(
        "  4. Display blacklist status, reason, and added_by",
        Style::default().fg(Color::DarkGray),
      ),
    ]),
    Line::from(""),
    Line::from(vec![
      Span::styled("  Use the CLI for now: ", Style::default().fg(Color::DarkGray)),
      Span::styled(
        "sss blacklist check <mint> <address>",
        Style::default().fg(Color::Green),
      ),
    ]),
  ];

  frame.render_widget(
    Paragraph::new(placeholder_lines).block(placeholder_block),
    chunks[1],
  );
}
