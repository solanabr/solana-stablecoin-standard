mod dashboard;
mod roles;
mod blacklist;
mod events;

use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style, Stylize};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph, Tabs};

use solana_sdk::signer::Signer;

use crate::app::{App, Tab};

/// Main draw function — renders the full TUI frame.
pub fn draw(frame: &mut Frame, app: &App) {
  let chunks = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
      Constraint::Length(3), // header + tabs
      Constraint::Min(0),   // content
      Constraint::Length(3), // footer
    ])
    .split(frame.area());

  draw_header(frame, app, chunks[0]);
  draw_content(frame, app, chunks[1]);
  draw_footer(frame, app, chunks[2]);
}

/// Header bar with title, mint address, and tab selector.
fn draw_header(frame: &mut Frame, app: &App, area: Rect) {
  let header_chunks = Layout::default()
    .direction(Direction::Vertical)
    .constraints([
      Constraint::Length(1), // title line
      Constraint::Length(2), // tabs
    ])
    .split(area);

  // Title line
  let wallet_short = App::short_key(&app.payer.pubkey());
  let title_line = Line::from(vec![
    Span::styled(
      " SSS Admin Dashboard ",
      Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
    ),
    Span::raw("  Mint: "),
    Span::styled(
      app.mint_short(),
      Style::default().fg(Color::Yellow),
    ),
    Span::raw("  Wallet: "),
    Span::styled(
      wallet_short,
      Style::default().fg(Color::Green),
    ),
    if app.loading {
      Span::styled("  [loading...]", Style::default().fg(Color::Magenta))
    } else {
      Span::raw("")
    },
  ]);
  frame.render_widget(Paragraph::new(title_line), header_chunks[0]);

  // Tab bar
  let tab_titles: Vec<Line> = Tab::ALL
    .iter()
    .map(|t| {
      let style = if *t == app.active_tab {
        Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
      } else {
        Style::default().fg(Color::DarkGray)
      };
      Line::from(Span::styled(t.title(), style))
    })
    .collect();

  let tabs = Tabs::new(tab_titles)
    .block(
      Block::default()
        .borders(Borders::BOTTOM)
        .border_style(Style::default().fg(Color::DarkGray)),
    )
    .highlight_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
    .select(app.active_tab.index())
    .divider(Span::styled(" | ", Style::default().fg(Color::DarkGray)));

  frame.render_widget(tabs, header_chunks[1]);
}

/// Route content rendering to the active tab.
fn draw_content(frame: &mut Frame, app: &App, area: Rect) {
  // Show error banner if present
  if let Some(ref err) = app.error_message {
    let content_chunks = Layout::default()
      .direction(Direction::Vertical)
      .constraints([
        Constraint::Length(3),
        Constraint::Min(0),
      ])
      .split(area);

    let error_block = Block::default()
      .borders(Borders::ALL)
      .border_style(Style::default().fg(Color::Red))
      .title(Span::styled(" Error ", Style::default().fg(Color::Red).bold()));
    let error_para = Paragraph::new(err.as_str())
      .style(Style::default().fg(Color::Red))
      .block(error_block);
    frame.render_widget(error_para, content_chunks[0]);

    render_tab(frame, app, content_chunks[1]);
  } else {
    render_tab(frame, app, area);
  }
}

/// Dispatch to the correct tab renderer.
fn render_tab(frame: &mut Frame, app: &App, area: Rect) {
  match app.active_tab {
    Tab::Dashboard => dashboard::draw(frame, app, area),
    Tab::Roles => roles::draw(frame, app, area),
    Tab::Blacklist => blacklist::draw(frame, app, area),
    Tab::Events => events::draw(frame, app, area),
  }
}

/// Footer with keybinding hints.
fn draw_footer(frame: &mut Frame, app: &App, area: Rect) {
  let hints = vec![
    Span::styled(" Tab", Style::default().fg(Color::Cyan).bold()),
    Span::raw(": Switch tabs  "),
    Span::styled("q", Style::default().fg(Color::Cyan).bold()),
    Span::raw(": Quit  "),
    Span::styled("r", Style::default().fg(Color::Cyan).bold()),
    Span::raw(": Refresh  "),
    Span::styled("Up/Down", Style::default().fg(Color::Cyan).bold()),
    Span::raw(": Navigate"),
    if app.loading {
      Span::styled("  [refreshing...]", Style::default().fg(Color::Yellow))
    } else {
      Span::raw("")
    },
  ];

  let footer = Paragraph::new(Line::from(hints))
    .block(
      Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(Color::DarkGray)),
    );
  frame.render_widget(footer, area);
}
