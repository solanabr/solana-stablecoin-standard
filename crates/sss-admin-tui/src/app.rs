use crossterm::event::KeyCode;
use ratatui::{prelude::*, widgets::*};
use sss_domain::{LifecycleRequest, LifecycleRequestType, LifecycleStatus};

use crate::{
    runtime::{AppRuntime, RuntimeState},
    screens::{audit, compliance, governance, operations, overview, settings},
    services::{
        audit::AuditViewModel, compliance::ComplianceViewModel, governance::GovernanceViewModel,
        operations::OperationsViewModel, overview::OverviewViewModel, settings::SettingsViewModel,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Overview,
    Operations,
    Compliance,
    Governance,
    Audit,
    Settings,
}

impl Route {
    fn all() -> &'static [Route] {
        &[
            Route::Overview,
            Route::Operations,
            Route::Compliance,
            Route::Governance,
            Route::Audit,
            Route::Settings,
        ]
    }

    fn label(self) -> &'static str {
        match self {
            Route::Overview => "Overview",
            Route::Operations => "Operations",
            Route::Compliance => "Compliance",
            Route::Governance => "Governance",
            Route::Audit => "Audit",
            Route::Settings => "Settings",
        }
    }
}

pub enum AppAction {
    None,
    Refresh,
    Quit,
}

#[derive(Clone, Copy)]
pub enum OperationFormField {
    First,
    Second,
    Third,
}

impl OperationFormField {
    pub fn index(self) -> usize {
        match self {
            Self::First => 0,
            Self::Second => 1,
            Self::Third => 2,
        }
    }

    fn next(self) -> Self {
        match self {
            Self::First => Self::Second,
            Self::Second => Self::Third,
            Self::Third => Self::First,
        }
    }
}

pub struct MintFormState {
    pub recipient: String,
    pub amount: String,
    pub reason: String,
    pub active_field: OperationFormField,
}

pub struct BurnFormState {
    pub account: String,
    pub amount: String,
    pub reason: String,
    pub active_field: OperationFormField,
}

pub struct SingleInputFormState {
    pub value: String,
}

pub struct BlacklistAddFormState {
    pub wallet: String,
    pub reason: String,
    pub active_field: OperationFormField,
}

pub struct SeizeFormState {
    pub from: String,
    pub to: String,
    pub amount: String,
    pub active_field: OperationFormField,
}

pub enum PendingAction {
    Approve(String),
    Execute(String),
    PauseMint,
    UnpauseMint,
}

pub enum OperationModal {
    Confirm {
        title: String,
        summary: String,
        confirm_hint: String,
        action: PendingAction,
    },
    MintForm(MintFormState),
    BurnForm(BurnFormState),
}

pub enum ComplianceModal {
    Confirm {
        title: String,
        summary: String,
        confirm_hint: String,
        action: PendingAction,
    },
    FreezeForm(SingleInputFormState),
    ThawForm(SingleInputFormState),
    BlacklistAddForm(BlacklistAddFormState),
    BlacklistRemoveForm(SingleInputFormState),
    SeizeForm(SeizeFormState),
}

pub struct OperationScreenState {
    pub requests: Vec<LifecycleRequest>,
    pub view: OperationsViewModel,
    pub status_filter: Option<LifecycleStatus>,
    pub type_filter: Option<LifecycleRequestType>,
    pub modal: Option<OperationModal>,
}

pub struct ComplianceScreenState {
    pub view: ComplianceViewModel,
    pub modal: Option<ComplianceModal>,
}

impl ComplianceScreenState {
    fn from_view(view: ComplianceViewModel) -> Self {
        Self { view, modal: None }
    }
}

impl OperationScreenState {
    fn from_requests(
        runtime: &AppRuntime,
        requests: Vec<LifecycleRequest>,
        status_filter: Option<LifecycleStatus>,
        type_filter: Option<LifecycleRequestType>,
    ) -> Self {
        let view = OperationsViewModel::from_requests(runtime, requests.clone(), status_filter, type_filter);
        Self {
            requests,
            view,
            status_filter,
            type_filter,
            modal: None,
        }
    }

    pub fn selected(&self) -> Option<usize> {
        self.view.selected
    }

    fn selected_request(&self) -> Option<&LifecycleRequest> {
        self.selected().and_then(|index| self.requests.get(index))
    }

    fn move_selection(&mut self, delta: i32) {
        if self.requests.is_empty() {
            self.view.update_selection(None, &self.requests);
            return;
        }
        let current = self.selected().unwrap_or(0) as i32;
        let next = (current + delta).clamp(0, self.requests.len() as i32 - 1) as usize;
        self.view.update_selection(Some(next), &self.requests);
    }
}

pub struct App {
    route_index: usize,
    runtime: RuntimeState,
    overview: Result<OverviewViewModel, String>,
    operations: Result<OperationScreenState, String>,
    compliance: Result<ComplianceScreenState, String>,
    governance: Result<GovernanceViewModel, String>,
    audit: Result<AuditViewModel, String>,
    settings: Result<SettingsViewModel, String>,
    compliance_visible: bool,
    audit_filter_index: usize,
    status_line: String,
}

impl App {
    pub fn new() -> Self {
        let runtime = AppRuntime::load();
        let compliance_visible = match &runtime {
            RuntimeState::Ready(runtime) => runtime.is_sss2(),
            RuntimeState::Error(_) => false,
        };
        let mut app = Self {
            route_index: 0,
            runtime,
            overview: Err("Overview not loaded".to_string()),
            operations: Err("Operations not loaded".to_string()),
            compliance: Err("Compliance not loaded".to_string()),
            governance: Err("Governance not loaded".to_string()),
            audit: Err("Audit not loaded".to_string()),
            settings: Err("Settings not loaded".to_string()),
            compliance_visible,
            audit_filter_index: 0,
            status_line: "q quit | left/right navigate | r refresh".to_string(),
        };
        app.refresh();
        app
    }

    pub fn refresh(&mut self) {
        match &self.runtime {
            RuntimeState::Ready(runtime) => {
                self.overview = runtime
                    .load_overview()
                    .map_err(|error| format!("{error:#}"));
                self.compliance_visible = self
                    .overview
                    .as_ref()
                    .map(|view| view.preset == "sss-2")
                    .unwrap_or(self.compliance_visible);
                if self.route_index >= self.routes().len() {
                    self.route_index = self.routes().len().saturating_sub(1);
                }

                let previous_filters = self
                    .operations
                    .as_ref()
                    .ok()
                    .map(|state| (state.status_filter, state.type_filter))
                    .unwrap_or((None, None));

                self.operations = match runtime.load_operations(previous_filters.0, previous_filters.1) {
                    Ok(requests) => Ok(OperationScreenState::from_requests(
                        runtime,
                        requests,
                        previous_filters.0,
                        previous_filters.1,
                    )),
                    Err(error) => Err(format!("{error:#}")),
                };
                self.compliance = if self.compliance_visible {
                    match runtime.load_compliance() {
                        Ok(view) => Ok(ComplianceScreenState::from_view(view)),
                        Err(error) => Err(format!("{error:#}")),
                    }
                } else {
                    Err("Compliance is only available for sss-2 mints".to_string())
                };
                self.governance = match runtime.load_governance() {
                    Ok(view) => Ok(view),
                    Err(error) => Err(format!("{error:#}")),
                };
                let event_filter = audit_filter_from_index(self.audit_filter_index);
                self.audit = match runtime.load_audit(event_filter, 100) {
                    Ok(view) => Ok(view),
                    Err(error) => Err(format!("{error:#}")),
                };
                self.settings = Ok(runtime.load_settings());

                if let Ok(operations) = &mut self.operations {
                    if operations.requests.is_empty() {
                        operations.view.update_selection(None, &operations.requests);
                    }
                }

                self.status_line = match self.current_route() {
                    Route::Overview => match &self.overview {
                        Ok(_) => "Overview refreshed".to_string(),
                        Err(error) => format!("Overview refresh failed: {error}"),
                    },
                    Route::Operations => match &self.operations {
                        Ok(state) => format!(
                            "Operations refreshed | status {} | type {}",
                            state.view.status_filter, state.view.type_filter
                        ),
                        Err(error) => format!("Operations refresh failed: {error}"),
                    },
                    Route::Compliance => match &self.compliance {
                        Ok(state) => format!(
                            "Compliance refreshed | mint {} | state {}",
                            state.view.mint, state.view.paused_label
                        ),
                        Err(error) => format!("Compliance refresh failed: {error}"),
                    },
                    Route::Governance => match &self.governance {
                        Ok(view) => format!("Governance refreshed | {} minters", view.minters.len()),
                        Err(error) => format!("Governance refresh failed: {error}"),
                    },
                    Route::Audit => match &self.audit {
                        Ok(view) => format!("Audit refreshed | {} events", view.rows.len()),
                        Err(error) => format!("Audit refresh failed: {error}"),
                    },
                    Route::Settings => "Settings refreshed".to_string(),
                };
            }
            RuntimeState::Error(error) => {
                self.overview = Err(error.clone());
                self.operations = Err(error.clone());
                self.compliance = Err(error.clone());
                self.governance = Err(error.clone());
                self.audit = Err(error.clone());
                self.settings = Err(error.clone());
                self.status_line = error.clone();
            }
        }
    }

    pub fn handle_key(&mut self, code: KeyCode) -> AppAction {
        if self.handle_modal_key(code) {
            return AppAction::None;
        }

        match code {
            KeyCode::Char('q') => AppAction::Quit,
            KeyCode::Char('r') => AppAction::Refresh,
            KeyCode::Left => {
                if self.route_index > 0 {
                    self.route_index -= 1;
                    self.set_route_status();
                }
                AppAction::None
            }
            KeyCode::Right => {
                if self.route_index + 1 < self.routes().len() {
                    self.route_index += 1;
                    self.set_route_status();
                }
                AppAction::None
            }
            _ => self.handle_route_key(code),
        }
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let area = frame.area();
        let vertical = Layout::vertical([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(10),
            Constraint::Length(2),
        ])
        .split(area);

        frame.render_widget(self.header(), vertical[0]);
        frame.render_widget(self.navigation(), vertical[1]);

        match self.current_route() {
            Route::Overview => overview::render(frame, vertical[2], &self.runtime, &self.overview),
            Route::Operations => operations::render(frame, vertical[2], &self.operations),
            Route::Compliance => compliance::render(frame, vertical[2], &self.compliance),
            Route::Governance => governance::render(frame, vertical[2], &self.governance),
            Route::Audit => audit::render(frame, vertical[2], &self.audit),
            Route::Settings => settings::render(frame, vertical[2], &self.settings),
        }

        frame.render_widget(self.footer(), vertical[3]);
    }

    fn handle_route_key(&mut self, code: KeyCode) -> AppAction {
        match self.current_route() {
            Route::Operations => {
                self.handle_operations_key(code);
                AppAction::None
            }
            Route::Compliance => {
                self.handle_compliance_key(code);
                AppAction::None
            }
            Route::Audit => {
                self.handle_audit_key(code);
                AppAction::None
            }
            _ => AppAction::None,
        }
    }

    fn handle_operations_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Up => {
                if let Ok(state) = &mut self.operations {
                    state.move_selection(-1);
                }
            }
            KeyCode::Down => {
                if let Ok(state) = &mut self.operations {
                    state.move_selection(1);
                }
            }
            KeyCode::Char('s') => {
                if let Ok(state) = &mut self.operations {
                    state.status_filter = cycle_status_filter(state.status_filter);
                }
                self.reload_operations();
            }
            KeyCode::Char('t') => {
                if let Ok(state) = &mut self.operations {
                    state.type_filter = cycle_type_filter(state.type_filter);
                }
                self.reload_operations();
            }
            KeyCode::Char('a') => self.open_confirm_modal("Approve selected operation", PendingAction::Approve),
            KeyCode::Char('e') => self.open_confirm_modal("Execute selected operation", PendingAction::Execute),
            KeyCode::Char('m') => {
                if let Ok(state) = &mut self.operations {
                    state.modal = Some(OperationModal::MintForm(MintFormState {
                        recipient: String::new(),
                        amount: String::new(),
                        reason: String::new(),
                        active_field: OperationFormField::First,
                    }));
                    self.status_line = "Mint request form opened".to_string();
                }
            }
            KeyCode::Char('b') => {
                if let Ok(state) = &mut self.operations {
                    state.modal = Some(OperationModal::BurnForm(BurnFormState {
                        account: String::new(),
                        amount: String::new(),
                        reason: String::new(),
                        active_field: OperationFormField::First,
                    }));
                    self.status_line = "Burn request form opened".to_string();
                }
            }
            _ => {}
        }
    }

    fn handle_compliance_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Char('p') => self.open_compliance_pause_modal(),
            KeyCode::Char('f') => {
                if let Ok(state) = &mut self.compliance {
                    state.modal = Some(ComplianceModal::FreezeForm(SingleInputFormState {
                        value: String::new(),
                    }));
                    self.status_line = "Freeze form opened".to_string();
                }
            }
            KeyCode::Char('t') => {
                if let Ok(state) = &mut self.compliance {
                    state.modal = Some(ComplianceModal::ThawForm(SingleInputFormState {
                        value: String::new(),
                    }));
                    self.status_line = "Thaw form opened".to_string();
                }
            }
            KeyCode::Char('a') => {
                if let Ok(state) = &mut self.compliance {
                    state.modal = Some(ComplianceModal::BlacklistAddForm(BlacklistAddFormState {
                        wallet: String::new(),
                        reason: String::new(),
                        active_field: OperationFormField::First,
                    }));
                    self.status_line = "Blacklist add form opened".to_string();
                }
            }
            KeyCode::Char('x') => {
                if let Ok(state) = &mut self.compliance {
                    state.modal = Some(ComplianceModal::BlacklistRemoveForm(SingleInputFormState {
                        value: String::new(),
                    }));
                    self.status_line = "Blacklist remove form opened".to_string();
                }
            }
            KeyCode::Char('s') => {
                if let Ok(state) = &mut self.compliance {
                    state.modal = Some(ComplianceModal::SeizeForm(SeizeFormState {
                        from: String::new(),
                        to: String::new(),
                        amount: String::new(),
                        active_field: OperationFormField::First,
                    }));
                    self.status_line = "Seize form opened".to_string();
                }
            }
            _ => {}
        }
    }

    fn handle_operations_modal_key(&mut self, code: KeyCode) -> bool {
        let Some(state) = self.operations.as_mut().ok() else {
            return false;
        };
        let Some(modal) = &mut state.modal else {
            return false;
        };

        match modal {
            OperationModal::Confirm { action, .. } => match code {
                KeyCode::Char('y') => {
                    let pending = match action {
                        PendingAction::Approve(id) => PendingAction::Approve(id.clone()),
                        PendingAction::Execute(id) => PendingAction::Execute(id.clone()),
                        _ => return true,
                    };
                    state.modal = None;
                    match pending {
                        PendingAction::Approve(id) => self.submit_approve(id),
                        PendingAction::Execute(id) => self.submit_execute(id),
                        _ => {}
                    }
                    true
                }
                KeyCode::Esc | KeyCode::Char('n') => {
                    state.modal = None;
                    self.status_line = "Action cancelled".to_string();
                    true
                }
                _ => true,
            },
            OperationModal::MintForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Mint request cancelled".to_string();
                    }
                    KeyCode::Tab => form.active_field = form.active_field.next(),
                    KeyCode::Backspace => match form.active_field {
                        OperationFormField::First => {
                            form.recipient.pop();
                        }
                        OperationFormField::Second => {
                            form.amount.pop();
                        }
                        OperationFormField::Third => {
                            form.reason.pop();
                        }
                    },
                    KeyCode::Enter => self.submit_mint_form(),
                    KeyCode::Char(ch) => match form.active_field {
                        OperationFormField::First => form.recipient.push(ch),
                        OperationFormField::Second => form.amount.push(ch),
                        OperationFormField::Third => form.reason.push(ch),
                    },
                    _ => {}
                }
                true
            }
            OperationModal::BurnForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Burn request cancelled".to_string();
                    }
                    KeyCode::Tab => form.active_field = form.active_field.next(),
                    KeyCode::Backspace => match form.active_field {
                        OperationFormField::First => {
                            form.account.pop();
                        }
                        OperationFormField::Second => {
                            form.amount.pop();
                        }
                        OperationFormField::Third => {
                            form.reason.pop();
                        }
                    },
                    KeyCode::Enter => self.submit_burn_form(),
                    KeyCode::Char(ch) => match form.active_field {
                        OperationFormField::First => form.account.push(ch),
                        OperationFormField::Second => form.amount.push(ch),
                        OperationFormField::Third => form.reason.push(ch),
                    },
                    _ => {}
                }
                true
            }
        }
    }

    fn handle_compliance_modal_key(&mut self, code: KeyCode) -> bool {
        let Some(state) = self.compliance.as_mut().ok() else {
            return false;
        };
        let Some(modal) = &mut state.modal else {
            return false;
        };

        match modal {
            ComplianceModal::Confirm { action, .. } => match code {
                KeyCode::Char('y') => {
                    let action = match action {
                        PendingAction::PauseMint => PendingAction::PauseMint,
                        PendingAction::UnpauseMint => PendingAction::UnpauseMint,
                        _ => return true,
                    };
                    state.modal = None;
                    match action {
                        PendingAction::PauseMint => self.submit_pause(),
                        PendingAction::UnpauseMint => self.submit_unpause(),
                        _ => {}
                    }
                    true
                }
                KeyCode::Esc | KeyCode::Char('n') => {
                    state.modal = None;
                    self.status_line = "Compliance action cancelled".to_string();
                    true
                }
                _ => true,
            },
            ComplianceModal::FreezeForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Freeze cancelled".to_string();
                    }
                    KeyCode::Backspace => {
                        form.value.pop();
                    }
                    KeyCode::Enter => self.submit_freeze(),
                    KeyCode::Char(ch) => form.value.push(ch),
                    _ => {}
                }
                true
            }
            ComplianceModal::ThawForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Thaw cancelled".to_string();
                    }
                    KeyCode::Backspace => {
                        form.value.pop();
                    }
                    KeyCode::Enter => self.submit_thaw(),
                    KeyCode::Char(ch) => form.value.push(ch),
                    _ => {}
                }
                true
            }
            ComplianceModal::BlacklistRemoveForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Blacklist remove cancelled".to_string();
                    }
                    KeyCode::Backspace => {
                        form.value.pop();
                    }
                    KeyCode::Enter => self.submit_blacklist_remove(),
                    KeyCode::Char(ch) => form.value.push(ch),
                    _ => {}
                }
                true
            }
            ComplianceModal::BlacklistAddForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Blacklist add cancelled".to_string();
                    }
                    KeyCode::Tab => form.active_field = form.active_field.next(),
                    KeyCode::Backspace => match form.active_field {
                        OperationFormField::First => {
                            form.wallet.pop();
                        }
                        OperationFormField::Second => {
                            form.reason.pop();
                        }
                        OperationFormField::Third => {}
                    },
                    KeyCode::Enter => self.submit_blacklist_add(),
                    KeyCode::Char(ch) => match form.active_field {
                        OperationFormField::First => form.wallet.push(ch),
                        OperationFormField::Second => form.reason.push(ch),
                        OperationFormField::Third => {}
                    },
                    _ => {}
                }
                true
            }
            ComplianceModal::SeizeForm(form) => {
                match code {
                    KeyCode::Esc => {
                        state.modal = None;
                        self.status_line = "Seize cancelled".to_string();
                    }
                    KeyCode::Tab => form.active_field = form.active_field.next(),
                    KeyCode::Backspace => match form.active_field {
                        OperationFormField::First => {
                            form.from.pop();
                        }
                        OperationFormField::Second => {
                            form.to.pop();
                        }
                        OperationFormField::Third => {
                            form.amount.pop();
                        }
                    },
                    KeyCode::Enter => self.submit_seize(),
                    KeyCode::Char(ch) => match form.active_field {
                        OperationFormField::First => form.from.push(ch),
                        OperationFormField::Second => form.to.push(ch),
                        OperationFormField::Third => form.amount.push(ch),
                    },
                    _ => {}
                }
                true
            }
        }
    }

    fn handle_modal_key(&mut self, code: KeyCode) -> bool {
        match self.current_route() {
            Route::Operations => self.handle_operations_modal_key(code),
            Route::Compliance => self.handle_compliance_modal_key(code),
            _ => false,
        }
    }

    fn handle_audit_key(&mut self, code: KeyCode) {
        match code {
            KeyCode::Char('t') => {
                self.audit_filter_index = (self.audit_filter_index + 1) % audit_filters().len();
                self.reload_audit();
            }
            _ => {}
        }
    }

    fn submit_mint_form(&mut self) {
        let Some((recipient, amount_text, reason)) = self
            .operations
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(OperationModal::MintForm(form)) => Some((
                    form.recipient.clone(),
                    form.amount.clone(),
                    form.reason.clone(),
                )),
                _ => None,
            })
        else {
            return;
        };

        let amount = match amount_text.parse::<i128>() {
            Ok(amount) => amount,
            Err(error) => {
                self.status_line = format!("Invalid mint amount: {error}");
                return;
            }
        };

        let Some(runtime) = self.runtime_ready() else {
            return;
        };

        match runtime.create_mint_request(recipient, amount, optional_text(&reason)) {
            Ok(request) => {
                self.status_line = format!("Mint request created: {}", request.id);
                if let Ok(state) = &mut self.operations {
                    state.modal = None;
                }
                self.reload_operations();
            }
            Err(error) => {
                self.status_line = format!("Mint request failed: {error}");
            }
        }
    }

    fn submit_burn_form(&mut self) {
        let Some((account, amount_text, reason)) = self
            .operations
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(OperationModal::BurnForm(form)) => Some((
                    form.account.clone(),
                    form.amount.clone(),
                    form.reason.clone(),
                )),
                _ => None,
            })
        else {
            return;
        };

        let amount = match amount_text.parse::<i128>() {
            Ok(amount) => amount,
            Err(error) => {
                self.status_line = format!("Invalid burn amount: {error}");
                return;
            }
        };

        let Some(runtime) = self.runtime_ready() else {
            return;
        };

        match runtime.create_burn_request(optional_text(&account), amount, optional_text(&reason)) {
            Ok(request) => {
                self.status_line = format!("Burn request created: {}", request.id);
                if let Ok(state) = &mut self.operations {
                    state.modal = None;
                }
                self.reload_operations();
            }
            Err(error) => {
                self.status_line = format!("Burn request failed: {error}");
            }
        }
    }

    fn submit_approve(&mut self, id: String) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.approve_operation(&id) {
            Ok(request) => {
                self.status_line = format!("Approved operation {}", request.id);
                self.reload_operations();
            }
            Err(error) => {
                self.status_line = format!("Approve failed: {error}");
            }
        }
    }

    fn submit_execute(&mut self, id: String) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.execute_operation(&id) {
            Ok(request) => {
                self.status_line = format!("Executed operation {}", request.id);
                self.reload_operations();
            }
            Err(error) => {
                self.status_line = format!("Execute failed: {error}");
            }
        }
    }

    fn open_compliance_pause_modal(&mut self) {
        if let Ok(state) = &mut self.compliance {
            let (title, action) = if state.view.paused {
                ("Unpause mint operations", PendingAction::UnpauseMint)
            } else {
                ("Pause mint operations", PendingAction::PauseMint)
            };
            state.modal = Some(ComplianceModal::Confirm {
                title: title.to_string(),
                summary: format!("Mint {} is currently {}", state.view.mint, state.view.paused_label),
                confirm_hint: "Press y to confirm, n or Esc to cancel.".to_string(),
                action,
            });
            self.status_line = format!("{title} opened");
        }
    }

    fn submit_pause(&mut self) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.pause_mint() {
            Ok(signature) => {
                self.status_line = format!("Paused mint. signature {signature}");
                self.reload_compliance();
            }
            Err(error) => {
                self.status_line = format!("Pause failed: {error:#}");
            }
        }
    }

    fn submit_unpause(&mut self) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.unpause_mint() {
            Ok(signature) => {
                self.status_line = format!("Unpaused mint. signature {signature}");
                self.reload_compliance();
            }
            Err(error) => {
                self.status_line = format!("Unpause failed: {error:#}");
            }
        }
    }

    fn submit_freeze(&mut self) {
        let token_account = self
            .compliance
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(ComplianceModal::FreezeForm(form)) => Some(form.value.clone()),
                _ => None,
            });
        let Some(token_account) = token_account else {
            return;
        };
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.freeze_account(token_account.trim()) {
            Ok(signature) => {
                self.status_line = format!("Account frozen. signature {signature}");
                if let Ok(state) = &mut self.compliance {
                    state.modal = None;
                }
                self.reload_compliance();
            }
            Err(error) => self.status_line = format!("Freeze failed: {error:#}"),
        }
    }

    fn submit_thaw(&mut self) {
        let token_account = self
            .compliance
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(ComplianceModal::ThawForm(form)) => Some(form.value.clone()),
                _ => None,
            });
        let Some(token_account) = token_account else {
            return;
        };
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.thaw_account(token_account.trim()) {
            Ok(signature) => {
                self.status_line = format!("Account thawed. signature {signature}");
                if let Ok(state) = &mut self.compliance {
                    state.modal = None;
                }
                self.reload_compliance();
            }
            Err(error) => self.status_line = format!("Thaw failed: {error:#}"),
        }
    }

    fn submit_blacklist_add(&mut self) {
        let values = self
            .compliance
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(ComplianceModal::BlacklistAddForm(form)) => {
                    Some((form.wallet.clone(), form.reason.clone()))
                }
                _ => None,
            });
        let Some((wallet, reason)) = values else {
            return;
        };
        if reason.trim().is_empty() {
            self.status_line = "Blacklist add requires reason".to_string();
            return;
        }
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.add_to_blacklist(wallet.trim(), reason.trim()) {
            Ok(signature) => {
                self.status_line = format!("Wallet blacklisted. signature {signature}");
                if let Ok(state) = &mut self.compliance {
                    state.modal = None;
                }
                self.reload_compliance();
            }
            Err(error) => self.status_line = format!("Blacklist add failed: {error:#}"),
        }
    }

    fn submit_blacklist_remove(&mut self) {
        let wallet = self
            .compliance
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(ComplianceModal::BlacklistRemoveForm(form)) => Some(form.value.clone()),
                _ => None,
            });
        let Some(wallet) = wallet else {
            return;
        };
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.remove_from_blacklist(wallet.trim()) {
            Ok(signature) => {
                self.status_line = format!("Wallet removed from blacklist. signature {signature}");
                if let Ok(state) = &mut self.compliance {
                    state.modal = None;
                }
                self.reload_compliance();
            }
            Err(error) => self.status_line = format!("Blacklist remove failed: {error:#}"),
        }
    }

    fn submit_seize(&mut self) {
        let values = self
            .compliance
            .as_ref()
            .ok()
            .and_then(|state| match &state.modal {
                Some(ComplianceModal::SeizeForm(form)) => {
                    Some((form.from.clone(), form.to.clone(), form.amount.clone()))
                }
                _ => None,
            });
        let Some((from, to, amount)) = values else {
            return;
        };
        let amount = optional_text(amount.trim());
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        match runtime.seize_tokens(from.trim(), to.trim(), amount.as_deref()) {
            Ok(signature) => {
                self.status_line = format!("Seize submitted. signature {signature}");
                if let Ok(state) = &mut self.compliance {
                    state.modal = None;
                }
                self.reload_compliance();
            }
            Err(error) => self.status_line = format!("Seize failed: {error:#}"),
        }
    }

    fn open_confirm_modal(
        &mut self,
        title: &str,
        action_builder: fn(String) -> PendingAction,
    ) {
        if let Ok(state) = &mut self.operations {
            if let Some(request) = state.selected_request() {
                let summary = format!(
                    "{} {} amount {} requested by {}",
                    request.type_.as_str(),
                    request.id,
                    request.amount,
                    request.requested_by
                );
                state.modal = Some(OperationModal::Confirm {
                    title: title.to_string(),
                    summary,
                    confirm_hint: "Press y to confirm, n or Esc to cancel.".to_string(),
                    action: action_builder(request.id.clone()),
                });
                self.status_line = format!("{title} opened");
            }
        }
    }

    fn reload_operations(&mut self) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        let (status_filter, type_filter) = self
            .operations
            .as_ref()
            .ok()
            .map(|state| (state.status_filter, state.type_filter))
            .unwrap_or((None, None));

        match runtime.load_operations(status_filter, type_filter) {
            Ok(requests) => {
                self.operations = Ok(OperationScreenState::from_requests(
                    runtime,
                    requests,
                    status_filter,
                    type_filter,
                ));
                self.status_line = format!(
                    "Operations refreshed | status {} | type {}",
                    match status_filter {
                        Some(status) => status.as_str(),
                        None => "all",
                    },
                    match type_filter {
                        Some(type_) => type_.as_str(),
                        None => "all",
                    }
                );
            }
            Err(error) => {
                self.operations = Err(format!("{error:#}"));
                self.status_line = format!("Operations refresh failed: {error:#}");
            }
        }
    }

    fn reload_compliance(&mut self) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        if !self.compliance_visible {
            return;
        }
        match runtime.load_compliance() {
            Ok(view) => {
                self.compliance = Ok(ComplianceScreenState::from_view(view));
            }
            Err(error) => {
                self.compliance = Err(format!("{error:#}"));
                self.status_line = format!("Compliance refresh failed: {error:#}");
            }
        }
    }

    fn reload_audit(&mut self) {
        let Some(runtime) = self.runtime_ready() else {
            return;
        };
        let filter = audit_filter_from_index(self.audit_filter_index);
        match runtime.load_audit(filter, 100) {
            Ok(view) => {
                self.audit = Ok(view);
                self.status_line = format!(
                    "Audit refreshed | event filter {}",
                    filter.unwrap_or("all")
                );
            }
            Err(error) => {
                self.audit = Err(format!("{error:#}"));
                self.status_line = format!("Audit refresh failed: {error:#}");
            }
        }
    }

    fn runtime_ready(&self) -> Option<&AppRuntime> {
        match &self.runtime {
            RuntimeState::Ready(runtime) => Some(runtime),
            RuntimeState::Error(_) => None,
        }
    }

    fn set_route_status(&mut self) {
        self.status_line = match self.current_route() {
            Route::Overview => "Overview | r refresh".to_string(),
            Route::Operations => {
                "Operations | up/down select | s status | t type | m mint | b burn | a approve | e execute"
                    .to_string()
            }
            Route::Compliance => {
                "Compliance | p pause/unpause | f freeze | t thaw | a blacklist add | x blacklist remove | s seize"
                    .to_string()
            }
            Route::Governance => "Governance | r refresh roles and minters".to_string(),
            Route::Audit => "Audit | t cycle event filter | r refresh".to_string(),
            Route::Settings => "Settings | resolved runtime values".to_string(),
        };
    }

    fn current_route(&self) -> Route {
        self.routes()[self.route_index]
    }

    fn routes(&self) -> Vec<Route> {
        Route::all()
            .iter()
            .copied()
            .filter(|route| *route != Route::Compliance || self.compliance_visible)
            .collect()
    }

    fn header(&self) -> Paragraph<'static> {
        let title = match &self.runtime {
            RuntimeState::Ready(runtime) => format!(
                "sss-admin | mint {} | rpc {} | api {}",
                runtime.short_mint(),
                runtime.rpc_label(),
                runtime.api_label()
            ),
            RuntimeState::Error(_) => "sss-admin | startup error".to_string(),
        };
        Paragraph::new(title).block(Block::default().borders(Borders::ALL).title("Admin TUI"))
    }

    fn navigation(&self) -> Tabs<'static> {
        let titles = self.routes()
            .iter()
            .map(|route| Line::from(route.label()))
            .collect::<Vec<_>>();
        Tabs::new(titles)
            .select(self.route_index)
            .block(Block::default().borders(Borders::ALL).title("Navigation"))
            .highlight_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
    }

    fn footer(&self) -> Paragraph<'_> {
        Paragraph::new(self.status_line.as_str())
            .style(Style::default().fg(Color::Gray))
            .block(Block::default().borders(Borders::TOP))
    }

}

fn optional_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn cycle_status_filter(current: Option<LifecycleStatus>) -> Option<LifecycleStatus> {
    match current {
        None => Some(LifecycleStatus::Requested),
        Some(LifecycleStatus::Requested) => Some(LifecycleStatus::Approved),
        Some(LifecycleStatus::Approved) => Some(LifecycleStatus::Signing),
        Some(LifecycleStatus::Signing) => Some(LifecycleStatus::Submitted),
        Some(LifecycleStatus::Submitted) => Some(LifecycleStatus::Finalized),
        Some(LifecycleStatus::Finalized) => Some(LifecycleStatus::Failed),
        Some(LifecycleStatus::Failed) => Some(LifecycleStatus::Cancelled),
        Some(LifecycleStatus::Cancelled) => None,
    }
}

fn cycle_type_filter(current: Option<LifecycleRequestType>) -> Option<LifecycleRequestType> {
    match current {
        None => Some(LifecycleRequestType::Mint),
        Some(LifecycleRequestType::Mint) => Some(LifecycleRequestType::Burn),
        Some(LifecycleRequestType::Burn) => None,
    }
}

fn audit_filters() -> &'static [Option<&'static str>] {
    &[
        None,
        Some("TokensMinted"),
        Some("TokensBurned"),
        Some("PauseChanged"),
        Some("AddressBlacklisted"),
        Some("AddressUnblacklisted"),
        Some("TokensSeized"),
        Some("AccountFrozen"),
        Some("AccountThawed"),
    ]
}

fn audit_filter_from_index(index: usize) -> Option<&'static str> {
    audit_filters()
        .get(index % audit_filters().len())
        .copied()
        .flatten()
}
