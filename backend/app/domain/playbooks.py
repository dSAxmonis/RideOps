"""Versioned draft playbooks. Support and Engineering still need to review these steps."""

from dataclasses import dataclass

PLAYBOOK_VERSION = "2026-11.v1"


@dataclass(frozen=True, slots=True)
class Playbook:
    title: str
    steps: tuple[str, ...]
    draft: bool = True


PLAYBOOKS: dict[str, Playbook] = {
    "Roster / booking not syncing": Playbook(
        "Check a roster or booking mismatch",
        (
            "Confirm which employees and which shift are affected.",
            "Compare the client's source roster with what the app shows for that shift.",
            "Ask whether the roster changed recently and when it was submitted.",
            "Check whether other employees on the same shift or client are affected.",
            "Record the differences you found before deciding to escalate.",
        ),
    ),
    "Live tracking / GPS incorrect": Playbook(
        "Check an incorrect tracking report",
        (
            "Confirm the trip or vehicle and the time the location looked wrong.",
            "Ask the driver whether the app was open and location access was on.",
            "Ask whether the driver had network coverage at that time.",
            "Check whether the problem affects one vehicle or several.",
            "Save a screenshot or route trace if one is available.",
        ),
    ),
    "Report export failing": Playbook(
        "Check a failing report export",
        (
            "Record the report name, filters and date range used.",
            "Compare the ticket with the matched tickets and any known issue shown here.",
            "Retry once with a shorter date range and note the result.",
            "Ask whether other users at the client see the same failure.",
            "Copy the exact error message or take a screenshot.",
        ),
    ),
    "Cab delay / no-show complaint": Playbook(
        "Check a delay or no-show complaint",
        (
            "Confirm the trip, employee and scheduled pickup time.",
            "Compare the scheduled time with the actual trip record.",
            "Contact the vendor or driver and record their explanation.",
            "Decide whether this is a service issue or a suspected system issue.",
            "Update the client with what was found and the next step.",
        ),
    ),
    "How-to / feature request": Playbook(
        "Answer a how-to or feature request",
        (
            "Write down what the user is trying to do.",
            "Look for an existing help article or runbook that covers it.",
            "Check whether the user's role should have access to this task.",
            "Share the guidance and confirm that it solved the request.",
            "If it is a new feature request, record it as a request rather than a bug.",
        ),
    ),
    "Login / access issue": Playbook(
        "Check a login or access issue",
        (
            "Confirm which user is affected. Never ask for their password.",
            "Check that the account is active and has the expected role.",
            "Try the standard password or session reset.",
            "Ask whether the user can sign in from another browser or device.",
            "Copy the exact error message if the problem continues.",
        ),
    ),
    "OTP / boarding issue": Playbook(
        "Check an OTP or boarding issue",
        (
            "Confirm the trip and the employee who could not board.",
            "Verify the employee's contact details on file. Never ask them to share the OTP.",
            "Try one resend and note the time and result.",
            "Check whether other employees on the trip are affected.",
            "Record how the employee boarded, if they did.",
        ),
    ),
    "Billing / invoice discrepancy": Playbook(
        "Check an invoice discrepancy",
        (
            "Record the invoice number and billing period.",
            "Ask the client which line or amount they dispute.",
            "Compare the expected amount with the billed amount.",
            "Check the agreed rate with the account owner if it is unclear.",
            "Summarise the difference before routing it onward.",
        ),
    ),
    "Employee address / geocode change": Playbook(
        "Check an address or map pin change",
        (
            "Confirm the employee and the requested address change.",
            "Check that the change is approved under the client's process.",
            "Compare the saved map pin with the new address.",
            "Note any upcoming trips that could be affected.",
            "Confirm the result with the requester.",
        ),
    ),
    "Driver / vehicle compliance docs": Playbook(
        "Check a compliance document issue",
        (
            "Confirm the driver or vehicle and the document involved.",
            "Check the document type and expiry date.",
            "Ask the vendor for the current document if it is missing or expired.",
            "Compare the document details with the record on file.",
            "Follow the compliance owner's guidance before clearing the issue.",
        ),
    ),
}
