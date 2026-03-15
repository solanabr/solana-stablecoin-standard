use sss_domain::EventRecord;

pub struct AuditViewModel {
    pub mint: String,
    pub event_type_filter: String,
    pub rows: Vec<AuditEventRow>,
}

pub struct AuditEventRow {
    pub event_type: String,
    pub slot: String,
    pub signature: String,
    pub timestamp: String,
}

impl AuditViewModel {
    pub fn from_events(mint: &str, event_type_filter: Option<&str>, events: Vec<EventRecord>) -> Self {
        Self {
            mint: mint.to_string(),
            event_type_filter: event_type_filter.unwrap_or("all").to_string(),
            rows: events
                .into_iter()
                .map(|event| AuditEventRow {
                    event_type: event.event_type,
                    slot: event.slot.to_string(),
                    signature: event.tx_signature,
                    timestamp: event
                        .block_time
                        .map(|time| time.to_rfc3339())
                        .unwrap_or_else(|| "-".to_string()),
                })
                .collect(),
        }
    }
}
