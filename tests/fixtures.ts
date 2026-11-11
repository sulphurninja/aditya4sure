/** Small synthetic seed — tests never depend on the private personal seed file. */
export const fixtureSeed = {
  schema_version: "1.0",
  owner: "Test Owner",
  compiled_at: "2026-11-10",
  facts: [
    { id: "f0002", section: "identity", subject: "aditya", statement: "Date of birth: 15 March 2002.", as_of: "2026-03-15", confidence: "high", status: "reported", source: "chat_history_summary", sensitivity: "normal", tags: [], temporal_state: "historical_or_current_unknown" },
    { id: "f0030", section: "projects", subject: "aditya", statement: "Zaptick February 2026 snapshot: ~₹4.85 lakh MRR.", as_of: "2026-02-01", confidence: "high", status: "reported", source: "chat_history_summary", sensitivity: "normal", tags: ["zaptick"], temporal_state: "historical_metric" },
    { id: "f0058", section: "relationships", subject: "komal", statement: "Komal is Aditya's partner in Pune.", as_of: "2026-08-15", confidence: "high", status: "reported", source: "chat_history_summary", sensitivity: "sensitive", tags: [], temporal_state: "historical_or_current_unknown" },
    { id: "f0064", section: "relationships", subject: "komal", statement: "Planned Pune date on 16 November 2026 with Komal.", as_of: "2026-11-16", confidence: "high", status: "planned_future", source: "chat_history_summary", sensitivity: "sensitive", tags: [], temporal_state: "historical_or_current_unknown" },
    { id: "f0068", section: "family", subject: "mother", statement: "Mother is a yoga teacher and BAMS-qualified health educator.", as_of: "2026-11-10", confidence: "high", status: "reported", source: "account_history_caution", sensitivity: "sensitive", tags: [], temporal_state: "historical_or_current_unknown" },
    { id: "f0070", section: "health", subject: "aditya", statement: "Height roughly 5ft 8in (earlier 169cm), weight 49 kg.", as_of: "2026-09-15", confidence: "high", status: "reported", source: "chat_history_summary", sensitivity: "sensitive", tags: [], temporal_state: "historical_measurement" },
    { id: "f0087", section: "communication", subject: "aditya", statement: "Prefers minimal emojis in professional posts.", as_of: "2025-08-27", confidence: "high", status: "preference", source: "chat_history_summary", sensitivity: "normal", tags: [], temporal_state: "historical_or_current_unknown" },
    { id: "f0092", section: "timeline", subject: "aditya", statement: "Planned special Pune date on 16 November 2026.", as_of: "2026-11-16", confidence: "high", status: "planned_future", source: "chat_history_summary", sensitivity: "normal", tags: [], temporal_state: "historical_or_current_unknown" },
  ],
  account_identity_boundaries: [],
};
