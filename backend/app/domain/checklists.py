"""Versioned evidence checklists. Bump CHECKLIST_VERSION when any item changes."""

from dataclasses import dataclass

CHECKLIST_VERSION = "2026-11.v2"
MIN_PROOF_CHARS = 8
MIN_PROOF_DISTINCT = 4
MAX_PROOF_CHARS = 300


@dataclass(frozen=True, slots=True)
class ChecklistItem:
    key: str
    label: str
    proof_hint: str
    required: bool = True


CHECKLISTS: dict[str, tuple[ChecklistItem, ...]] = {
    "Roster / booking not syncing": (
        ChecklistItem(
            "affected_employee_ids",
            "Affected employee IDs listed",
            "Paste the affected employee IDs",
        ),
        ChecklistItem(
            "shift_date_time", "Shift date and time captured", "State the shift date and time"
        ),
        ChecklistItem(
            "source_vs_app_compared",
            "Source roster compared with the app",
            "Note what the source shows and what the app shows",
        ),
        ChecklistItem(
            "last_sync_time",
            "Last successful sync time noted",
            "State the last sync time you can see",
            required=False,
        ),
    ),
    "Live tracking / GPS incorrect": (
        ChecklistItem(
            "trip_or_vehicle_id", "Trip or vehicle ID captured", "Paste the trip or vehicle ID"
        ),
        ChecklistItem(
            "incident_time",
            "Time of incorrect location captured",
            "State when the location looked wrong",
        ),
        ChecklistItem(
            "driver_app_gps_checked",
            "Driver app and GPS permission checked",
            "Note what the driver confirmed about the app and GPS",
        ),
        ChecklistItem(
            "screenshot_attached",
            "Screenshot or route trace attached",
            "Give the attachment name or link",
            required=False,
        ),
    ),
    "Report export failing": (
        ChecklistItem(
            "report_name_filters",
            "Report name and filters captured",
            "State the report name and filters used",
        ),
        ChecklistItem("date_range", "Date range captured", "State the exact date range"),
        ChecklistItem(
            "known_issues_checked",
            "Known-issue list checked",
            "Name the known issue checked, or say none matched",
        ),
        ChecklistItem(
            "error_attached",
            "Error message or screenshot attached",
            "Paste the error text or attachment name",
            required=False,
        ),
    ),
    "Cab delay / no-show complaint": (
        ChecklistItem("trip_id", "Trip ID captured", "Paste the trip ID"),
        ChecklistItem(
            "scheduled_vs_actual",
            "Scheduled and actual times compared",
            "State the scheduled time and the actual time",
        ),
        ChecklistItem(
            "vendor_contacted",
            "Vendor or driver contacted",
            "Note who was contacted and what they said",
        ),
    ),
    "How-to / feature request": (
        ChecklistItem(
            "help_article_checked",
            "Help article or runbook checked",
            "Name the article or runbook checked",
        ),
        ChecklistItem("user_goal", "User goal written down", "Describe what the user wants to do"),
        ChecklistItem(
            "role_permissions_checked",
            "User role and permissions checked",
            "State the user's role and relevant access",
        ),
    ),
    "Login / access issue": (
        ChecklistItem(
            "user_identifier",
            "Affected user identifier captured",
            "Give the affected user's ID (no passwords)",
        ),
        ChecklistItem(
            "account_status_checked",
            "Account status and role checked",
            "State the account status and role found",
        ),
        ChecklistItem(
            "reset_attempted",
            "Password or session reset attempted",
            "Note the reset tried and its result",
        ),
        ChecklistItem(
            "error_attached",
            "Error message attached",
            "Paste the error text or attachment name",
            required=False,
        ),
    ),
    "OTP / boarding issue": (
        ChecklistItem("trip_id", "Trip ID captured", "Paste the trip ID"),
        ChecklistItem(
            "employee_contact_verified",
            "Employee contact details verified",
            "Note how the contact details were verified (no full numbers)",
        ),
        ChecklistItem(
            "otp_retry_attempted",
            "OTP resend or retry attempted",
            "Note the retry time and result (never the OTP)",
        ),
    ),
    "Billing / invoice discrepancy": (
        ChecklistItem("invoice_number", "Invoice number captured", "Paste the invoice number"),
        ChecklistItem("billing_period", "Billing period captured", "State the billing period"),
        ChecklistItem(
            "expected_vs_billed",
            "Expected and billed amounts compared",
            "State the expected and billed amounts",
        ),
        ChecklistItem(
            "contract_rate_checked",
            "Contract rate checked",
            "Note the rate source that was checked",
            required=False,
        ),
    ),
    "Employee address / geocode change": (
        ChecklistItem("employee_id", "Employee ID captured", "Paste the employee ID"),
        ChecklistItem(
            "old_new_address",
            "Old and new address captured",
            "Reference where the old and new address are recorded",
        ),
        ChecklistItem(
            "geocode_verified",
            "Pin location verified on the map",
            "Note what the map pin showed",
        ),
    ),
    "Driver / vehicle compliance docs": (
        ChecklistItem(
            "driver_or_vehicle_id",
            "Driver or vehicle ID captured",
            "Paste the driver or vehicle ID",
        ),
        ChecklistItem(
            "document_type_expiry",
            "Document type and expiry captured",
            "State the document type and expiry date",
        ),
        ChecklistItem(
            "document_attached",
            "Current document attached",
            "Give the attachment name or link",
        ),
    ),
}
