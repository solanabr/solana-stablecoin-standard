use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::Span;
use ratatui::widgets::{Block, Borders, Cell, Row, Table};

use crate::app::App;

/// Render the Roles tab: table of role statuses for the connected wallet.
pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
  let block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::Blue))
    .title(Span::styled(
      " Roles ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  if app.roles.is_empty() {
    let empty_block = block.clone();
    let rows: Vec<Row> = vec![
      Row::new(vec![
        Cell::from(""),
        Cell::from("No role data. Press 'r' to refresh."),
        Cell::from(""),
      ])
      .style(Style::default().fg(Color::Yellow)),
    ];

    let table = Table::new(
      rows,
      [
        ratatui::layout::Constraint::Length(6),
        ratatui::layout::Constraint::Min(30),
        ratatui::layout::Constraint::Length(10),
      ],
    )
    .block(empty_block);

    frame.render_widget(table, area);
    return;
  }

  let header = Row::new(vec![
    Cell::from("  #").style(Style::default().fg(Color::DarkGray).bold()),
    Cell::from("Role").style(Style::default().fg(Color::DarkGray).bold()),
    Cell::from("Status").style(Style::default().fg(Color::DarkGray).bold()),
  ])
  .height(1)
  .bottom_margin(1);

  let rows: Vec<Row> = app
    .roles
    .iter()
    .enumerate()
    .map(|(i, role)| {
      let is_selected = i == app.selected_index;

      let (status_icon, status_color) = if role.active {
        ("\u{2713}", Color::Green)  // checkmark
      } else {
        ("\u{2717}", Color::Red)    // cross
      };

      let row_style = if is_selected {
        Style::default().add_modifier(Modifier::BOLD).bg(Color::DarkGray)
      } else {
        Style::default()
      };

      Row::new(vec![
        Cell::from(format!("  {}", role.role_u8)).style(Style::default().fg(Color::DarkGray)),
        Cell::from(role.name).style(Style::default().fg(Color::White)),
        Cell::from(status_icon).style(Style::default().fg(status_color).bold()),
      ])
      .style(row_style)
      .height(1)
    })
    .collect();

  let table = Table::new(
    rows,
    [
      ratatui::layout::Constraint::Length(6),
      ratatui::layout::Constraint::Min(20),
      ratatui::layout::Constraint::Length(10),
    ],
  )
  .header(header)
  .block(block);

  frame.render_widget(table, area);
}
