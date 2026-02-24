use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};

use crate::app::App;

/// Render the Dashboard tab: config info + supply stats.
pub fn draw(frame: &mut Frame, app: &App, area: Rect) {
  match &app.config_data {
    Some(config) => draw_populated(frame, app, config, area),
    None => draw_empty(frame, area),
  }
}

fn draw_empty(frame: &mut Frame, area: Rect) {
  let block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::DarkGray))
    .title(Span::styled(
      " Dashboard ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  let text = Paragraph::new(vec![
    Line::from(""),
    Line::from(Span::styled(
      "  No data loaded. Press 'r' to refresh.",
      Style::default().fg(Color::Yellow),
    )),
    Line::from(""),
    Line::from(Span::styled(
      "  Ensure your RPC endpoint is reachable and the mint is initialized.",
      Style::default().fg(Color::DarkGray),
    )),
  ])
  .block(block);

  frame.render_widget(text, area);
}

fn draw_populated(
  frame: &mut Frame,
  app: &App,
  config: &crate::app::ConfigData,
  area: Rect,
) {
  let chunks = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
      Constraint::Length(9),  // config info
      Constraint::Min(8),     // supply stats
    ])
    .split(area);

  // -- Config Info Block --
  let info_block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::Blue))
    .title(Span::styled(
      " Stablecoin Config ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  let pause_style = if config.paused {
    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)
  } else {
    Style::default().fg(Color::Green)
  };
  let pause_text = if config.paused { "PAUSED" } else { "Active" };

  let info_lines = vec![
    Line::from(vec![
      Span::styled("  Mint:       ", Style::default().fg(Color::DarkGray)),
      Span::styled(config.mint.to_string(), Style::default().fg(Color::Yellow)),
    ]),
    Line::from(vec![
      Span::styled("  Config PDA: ", Style::default().fg(Color::DarkGray)),
      Span::styled(app.config_pda.to_string(), Style::default().fg(Color::White)),
    ]),
    Line::from(vec![
      Span::styled("  Authority:  ", Style::default().fg(Color::DarkGray)),
      Span::styled(config.authority.to_string(), Style::default().fg(Color::White)),
    ]),
    Line::from(vec![
      Span::styled("  Preset:     ", Style::default().fg(Color::DarkGray)),
      Span::styled(App::preset_name(config.preset), Style::default().fg(Color::Magenta)),
    ]),
    Line::from(vec![
      Span::styled("  Status:     ", Style::default().fg(Color::DarkGray)),
      Span::styled(pause_text, pause_style),
    ]),
    Line::from(vec![
      Span::styled("  Decimals:   ", Style::default().fg(Color::DarkGray)),
      Span::styled(config.decimals.to_string(), Style::default().fg(Color::White)),
    ]),
  ];

  frame.render_widget(Paragraph::new(info_lines).block(info_block), chunks[0]);

  // -- Supply Stats Block --
  let supply_block = Block::default()
    .borders(Borders::ALL)
    .border_style(Style::default().fg(Color::Blue))
    .title(Span::styled(
      " Supply Stats ",
      Style::default().fg(Color::Cyan).bold(),
    ));

  let current_supply = config.current_supply();
  let cap_text = match config.supply_cap {
    Some(cap) => App::format_amount(cap, config.decimals),
    None => "Unlimited".to_string(),
  };

  // Supply utilization bar (if capped)
  let utilization_line = if let Some(cap) = config.supply_cap {
    if cap > 0 {
      let pct = (current_supply as f64 / cap as f64 * 100.0).min(100.0);
      let bar_width = 30;
      let filled = ((pct / 100.0) * bar_width as f64) as usize;
      let empty = bar_width - filled;
      let bar_color = if pct > 90.0 {
        Color::Red
      } else if pct > 70.0 {
        Color::Yellow
      } else {
        Color::Green
      };

      Line::from(vec![
        Span::styled("  Utilization: ", Style::default().fg(Color::DarkGray)),
        Span::styled(
          "\u{2588}".repeat(filled),
          Style::default().fg(bar_color),
        ),
        Span::styled(
          "\u{2591}".repeat(empty),
          Style::default().fg(Color::DarkGray),
        ),
        Span::styled(
          format!(" {:.1}%", pct),
          Style::default().fg(bar_color).bold(),
        ),
      ])
    } else {
      Line::from("")
    }
  } else {
    Line::from(vec![
      Span::styled("  Utilization: ", Style::default().fg(Color::DarkGray)),
      Span::styled("N/A (no cap)", Style::default().fg(Color::DarkGray)),
    ])
  };

  let supply_lines = vec![
    Line::from(""),
    Line::from(vec![
      Span::styled("  Total Minted:  ", Style::default().fg(Color::DarkGray)),
      Span::styled(
        App::format_amount(config.total_minted, config.decimals),
        Style::default().fg(Color::Green).bold(),
      ),
    ]),
    Line::from(vec![
      Span::styled("  Total Burned:  ", Style::default().fg(Color::DarkGray)),
      Span::styled(
        App::format_amount(config.total_burned, config.decimals),
        Style::default().fg(Color::Red).bold(),
      ),
    ]),
    Line::from(vec![
      Span::styled("  Current Supply:", Style::default().fg(Color::DarkGray)),
      Span::styled(
        format!(" {}", App::format_amount(current_supply, config.decimals)),
        Style::default().fg(Color::Cyan).bold(),
      ),
    ]),
    Line::from(vec![
      Span::styled("  Supply Cap:    ", Style::default().fg(Color::DarkGray)),
      Span::styled(
        cap_text,
        Style::default().fg(Color::White),
      ),
    ]),
    Line::from(""),
    utilization_line,
  ];

  frame.render_widget(Paragraph::new(supply_lines).block(supply_block), chunks[1]);
}
