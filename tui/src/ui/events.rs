use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::Span;
use ratatui::widgets::{Block, Borders, Cell, Row, Table};

use crate::app::App;

/// Render the Events tab: scrollable log of TUI events.
pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
  let block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::Blue))
    .title(Span::styled(
      " Event Log ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  if app.events.is_empty() {
    let rows: Vec<Row> = vec![
      Row::new(vec![
        Cell::from(""),
        Cell::from("No events yet."),
      ])
      .style(Style::default().fg(Color::DarkGray)),
    ];

    let table = Table::new(
      rows,
      [
        ratatui::layout::Constraint::Length(12),
        ratatui::layout::Constraint::Min(40),
      ],
    )
    .block(block);

    frame.render_widget(table, area);
    return;
  }

  let header = Row::new(vec![
    Cell::from("  Time").style(Style::default().fg(Color::DarkGray).bold()),
    Cell::from("Event").style(Style::default().fg(Color::DarkGray).bold()),
  ])
  .height(1)
  .bottom_margin(1);

  // Show events in reverse chronological order (newest first)
  let rows: Vec<Row> = app
    .events
    .iter()
    .rev()
    .enumerate()
    .map(|(i, event)| {
      let is_selected = i == app.selected_index;

      let msg_color = if event.message.starts_with("Error") {
        Color::Red
      } else if event.message.contains("refreshed") {
        Color::Green
      } else {
        Color::White
      };

      let row_style = if is_selected {
        Style::default().add_modifier(Modifier::BOLD).bg(Color::DarkGray)
      } else {
        Style::default()
      };

      Row::new(vec![
        Cell::from(format!("  {}", event.timestamp))
          .style(Style::default().fg(Color::DarkGray)),
        Cell::from(event.message.as_str())
          .style(Style::default().fg(msg_color)),
      ])
      .style(row_style)
      .height(1)
    })
    .collect();

  let table = Table::new(
    rows,
    [
      ratatui::layout::Constraint::Length(12),
      ratatui::layout::Constraint::Min(40),
    ],
  )
  .header(header)
  .block(block);

  frame.render_widget(table, area);
}
