from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime
from html import escape
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
BUDGET_EXCEL_FILE = BASE_DIR / "budget_mariage.xlsx"
DATA_LOCK = threading.Lock()
ADMIN_PASSWORD = ""
DEFAULT_ADMIN_PASSWORD = "mariage2026"

DEFAULT_DATA = {
    "budgetGoal": 15000,
    "budgetGuestCount": 150,
    "budgetAdultCount": 110,
    "budgetItems": [],
    "tasks": [],
    "guests": [],
    "updatedAt": 0,
}

VALID_GUEST_STATUS = {"pending", "yes", "no"}
VALID_GUEST_GROUP_TYPE = {"single", "couple", "family"}
VALID_GUEST_ATTENDANCE_TYPE = {"vin_repas", "vin_only"}


def normalize_guest_group_type(value: object) -> str:
    group_type = str(value or "").strip()
    if group_type in VALID_GUEST_GROUP_TYPE:
        return group_type
    return "single"


def normalize_guest_attendance_type(value: object) -> str:
    attendance_type = str(value or "").strip()
    if attendance_type in VALID_GUEST_ATTENDANCE_TYPE:
        return attendance_type
    return "vin_repas"


def normalize_guest_party_size(group_type: str, value: object) -> int:
    if group_type == "single":
        return 1
    if group_type == "couple":
        return 2

    if isinstance(value, (int, float)):
        size = int(value)
    else:
        try:
            size = int(str(value).strip())
        except (TypeError, ValueError):
            size = 0

    if size < 1:
        return 3
    return size


def create_default_data() -> dict:
    return {
        "budgetGoal": DEFAULT_DATA["budgetGoal"],
        "budgetGuestCount": DEFAULT_DATA["budgetGuestCount"],
        "budgetAdultCount": DEFAULT_DATA["budgetAdultCount"],
        "budgetItems": [],
        "tasks": [],
        "guests": [],
        "updatedAt": DEFAULT_DATA["updatedAt"],
    }


def normalize_data(candidate: object) -> dict:
    if not isinstance(candidate, dict):
        return create_default_data()

    normalized = create_default_data()

    budget_goal = candidate.get("budgetGoal")
    if isinstance(budget_goal, (int, float)) and budget_goal >= 0:
        normalized["budgetGoal"] = int(budget_goal)

    budget_guest_count = candidate.get("budgetGuestCount")
    if isinstance(budget_guest_count, (int, float)) and int(budget_guest_count) >= 1:
        normalized["budgetGuestCount"] = int(budget_guest_count)

    budget_adult_count = candidate.get("budgetAdultCount")
    if isinstance(budget_adult_count, (int, float)) and int(budget_adult_count) >= 1:
        normalized["budgetAdultCount"] = int(budget_adult_count)

    normalized["budgetAdultCount"] = min(normalized["budgetAdultCount"], normalized["budgetGuestCount"])

    updated_at = candidate.get("updatedAt")
    if isinstance(updated_at, (int, float)) and updated_at >= 0:
        normalized["updatedAt"] = int(updated_at)

    budget_items = candidate.get("budgetItems")
    if isinstance(budget_items, list):
        cleaned_budget = []
        for item in budget_items:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            amount = item.get("amount")
            if not label or not isinstance(amount, (int, float)) or amount < 0:
                continue
            identifier = str(item.get("id", "")).strip() or "item"
            cleaned_budget.append(
                {
                    "id": identifier,
                    "label": label,
                    "amount": amount,
                }
            )
        normalized["budgetItems"] = cleaned_budget

    tasks = candidate.get("tasks")
    if isinstance(tasks, list):
        cleaned_tasks = []
        for task in tasks:
            if not isinstance(task, dict):
                continue
            text = str(task.get("text", "")).strip()
            if not text:
                continue
            identifier = str(task.get("id", "")).strip() or "task"
            cleaned_tasks.append(
                {
                    "id": identifier,
                    "text": text,
                    "done": bool(task.get("done", False)),
                }
            )
        normalized["tasks"] = cleaned_tasks

    guests = candidate.get("guests")
    if isinstance(guests, list):
        cleaned_guests = []
        for guest in guests:
            if not isinstance(guest, dict):
                continue
            name = str(guest.get("name", "")).strip()
            status = guest.get("status", "pending")
            group_type = normalize_guest_group_type(guest.get("groupType"))
            attendance_type = normalize_guest_attendance_type(guest.get("attendanceType"))
            if not name:
                continue
            cleaned_guests.append(
                {
                    "id": str(guest.get("id", "")).strip() or "guest",
                    "name": name,
                    "groupType": group_type,
                    "attendanceType": attendance_type,
                    "partySize": normalize_guest_party_size(group_type, guest.get("partySize")),
                    "status": status if status in VALID_GUEST_STATUS else "pending",
                    "rsvpToken": str(guest.get("rsvpToken", "")).strip(),
                }
            )
        normalized["guests"] = cleaned_guests

    return normalized


def write_data_file(data: dict) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    DATA_FILE.write_text(payload, encoding="utf-8")


def write_budget_excel(data: dict) -> None:
    budget_items = data.get("budgetItems", [])
    guests = data.get("guests", [])
    budget_goal = float(data.get("budgetGoal", 0) or 0)
    guest_count = int(data.get("budgetGuestCount", 0) or 0)
    adult_count = int(data.get("budgetAdultCount", 0) or 0)
    updated_at = int(data.get("updatedAt", 0) or 0)

    budget_total = sum(float(item.get("amount", 0) or 0) for item in budget_items)
    budget_remaining = max(budget_goal - budget_total, 0)
    budget_usage = (budget_total / budget_goal) if budget_goal > 0 else 0
    cost_per_guest = (budget_total / guest_count) if guest_count > 0 else 0
    cost_per_adult = (budget_total / adult_count) if adult_count > 0 else 0

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Budget Mariage"

    title_fill = PatternFill(fill_type="solid", fgColor="F6DCE3")
    header_fill = PatternFill(fill_type="solid", fgColor="FCEEF3")
    total_fill = PatternFill(fill_type="solid", fgColor="F9F3E8")
    title_font = Font(name="Calibri", size=16, bold=True, color="8A2C4F")
    header_font = Font(name="Calibri", size=11, bold=True, color="7C2044")
    section_font = Font(name="Calibri", size=11, bold=True, color="6B1433")
    value_font = Font(name="Calibri", size=11, color="3F2330")
    thin_side = Side(style="thin", color="EBC8D6")
    soft_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    centered = Alignment(horizontal="center", vertical="center")
    left_aligned = Alignment(horizontal="left", vertical="center")
    right_aligned = Alignment(horizontal="right", vertical="center")
    currency_format = '#,##0.00 "EUR"'
    percent_format = "0.00%"

    sheet.merge_cells("A1:C1")
    title_cell = sheet["A1"]
    title_cell.value = "Budget du Mariage"
    title_cell.font = title_font
    title_cell.fill = title_fill
    title_cell.alignment = centered

    summary_rows = [
        ("Mise à jour", datetime.fromtimestamp(updated_at / 1000) if updated_at > 0 else "N/A"),
        ("Objectif budget", budget_goal),
        ("Dépenses engagées", budget_total),
        ("Reste disponible", budget_remaining),
        ("Part du budget utilisée", budget_usage),
        ("Invités prévus", guest_count),
        ("Adultes prévus", adult_count),
        ("Coût moyen par invité", cost_per_guest),
        ("Coût moyen par adulte", cost_per_adult),
    ]

    start_row = 3
    for offset, (label, value) in enumerate(summary_rows):
        row = start_row + offset
        label_cell = sheet.cell(row=row, column=1, value=label)
        value_cell = sheet.cell(row=row, column=2, value=value)
        label_cell.font = section_font
        label_cell.fill = header_fill
        label_cell.alignment = left_aligned
        value_cell.font = value_font
        value_cell.alignment = right_aligned
        label_cell.border = soft_border
        value_cell.border = soft_border

        if label in {"Objectif budget", "Dépenses engagées", "Reste disponible", "Coût moyen par invité", "Coût moyen par adulte"}:
            value_cell.number_format = currency_format
        elif label == "Part du budget utilisée":
            value_cell.number_format = percent_format
        elif label == "Mise à jour" and isinstance(value, datetime):
            value_cell.number_format = "DD/MM/YYYY HH:mm"

    table_header_row = start_row + len(summary_rows) + 2
    headers = ["Poste de dépense", "Montant", "Part du budget"]
    for col, header in enumerate(headers, start=1):
        cell = sheet.cell(row=table_header_row, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = centered
        cell.border = soft_border

    table_start_row = table_header_row + 1
    for index, item in enumerate(budget_items):
        row = table_start_row + index
        label = str(item.get("label", "")).strip()
        amount = float(item.get("amount", 0) or 0)
        ratio = (amount / budget_goal) if budget_goal > 0 else 0

        label_cell = sheet.cell(row=row, column=1, value=label)
        amount_cell = sheet.cell(row=row, column=2, value=amount)
        ratio_cell = sheet.cell(row=row, column=3, value=ratio)

        for cell in (label_cell, amount_cell, ratio_cell):
            cell.font = value_font
            cell.border = soft_border
            cell.alignment = left_aligned if cell.column == 1 else right_aligned

        amount_cell.number_format = currency_format
        ratio_cell.number_format = percent_format

    total_row = max(table_start_row, table_start_row + len(budget_items))
    total_label = sheet.cell(row=total_row, column=1, value="TOTAL")
    total_amount = sheet.cell(row=total_row, column=2, value=budget_total)
    total_ratio = sheet.cell(row=total_row, column=3, value=budget_usage)
    for cell in (total_label, total_amount, total_ratio):
        cell.font = Font(name="Calibri", size=11, bold=True, color="6B1433")
        cell.fill = total_fill
        cell.border = soft_border
        cell.alignment = right_aligned if cell.column > 1 else left_aligned
    total_amount.number_format = currency_format
    total_ratio.number_format = percent_format

    sheet.column_dimensions["A"].width = 42
    sheet.column_dimensions["B"].width = 17
    sheet.column_dimensions["C"].width = 17
    sheet.freeze_panes = f"A{table_start_row}"
    sheet.auto_filter.ref = f"A{table_header_row}:C{total_row}"

    guests_sheet = workbook.create_sheet("Invités RSVP")
    guests_sheet.merge_cells("A1:F1")
    guests_title_cell = guests_sheet["A1"]
    guests_title_cell.value = "Liste des invités et RSVP"
    guests_title_cell.font = title_font
    guests_title_cell.fill = title_fill
    guests_title_cell.alignment = centered

    total_households = len(guests)
    total_people = 0
    confirmed_people = 0
    declined_people = 0
    pending_people = 0

    for guest in guests:
        group_type = normalize_guest_group_type(guest.get("groupType"))
        party_size = normalize_guest_party_size(group_type, guest.get("partySize"))
        status = str(guest.get("status", "pending")).strip()
        total_people += party_size
        if status == "yes":
            confirmed_people += party_size
        elif status == "no":
            declined_people += party_size
        else:
            pending_people += party_size

    confirmation_rate = (confirmed_people / total_people) if total_people > 0 else 0
    guest_summary_rows = [
        ("Foyers invités", total_households),
        ("Personnes invitées", total_people),
        ("Personnes confirmées", confirmed_people),
        ("Personnes refusées", declined_people),
        ("Personnes en attente", pending_people),
        ("Taux de confirmation", confirmation_rate),
    ]

    guests_start_row = 3
    for offset, (label, value) in enumerate(guest_summary_rows):
        row = guests_start_row + offset
        label_cell = guests_sheet.cell(row=row, column=1, value=label)
        value_cell = guests_sheet.cell(row=row, column=2, value=value)
        label_cell.font = section_font
        label_cell.fill = header_fill
        label_cell.alignment = left_aligned
        value_cell.font = value_font
        value_cell.alignment = right_aligned
        label_cell.border = soft_border
        value_cell.border = soft_border
        if label == "Taux de confirmation":
            value_cell.number_format = percent_format

    guests_table_header_row = guests_start_row + len(guest_summary_rows) + 2
    guest_headers = ["Invite", "Groupe", "Nb pers.", "Presence", "Type invitation", "Lien RSVP"]
    for col, header in enumerate(guest_headers, start=1):
        cell = guests_sheet.cell(row=guests_table_header_row, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = centered
        cell.border = soft_border

    status_label_map = {
        "yes": "Confirme",
        "no": "Decline",
        "pending": "En attente",
    }
    group_label_map = {
        "single": "Solo",
        "couple": "Couple",
        "family": "Famille",
    }
    attendance_label_map = {
        "vin_repas": "Vin d'honneur + repas",
        "vin_only": "Vin d'honneur",
    }
    status_fill_map = {
        "yes": PatternFill(fill_type="solid", fgColor="E8F6ED"),
        "no": PatternFill(fill_type="solid", fgColor="FDECEE"),
        "pending": PatternFill(fill_type="solid", fgColor="FFF9E6"),
    }

    guests_table_start_row = guests_table_header_row + 1
    for index, guest in enumerate(guests):
        row = guests_table_start_row + index
        name = str(guest.get("name", "")).strip()
        group_type = normalize_guest_group_type(guest.get("groupType"))
        party_size = normalize_guest_party_size(group_type, guest.get("partySize"))
        status_key = str(guest.get("status", "pending")).strip()
        if status_key not in status_label_map:
            status_key = "pending"
        attendance_type = normalize_guest_attendance_type(guest.get("attendanceType"))
        token = str(guest.get("rsvpToken", "")).strip()
        rsvp_url = f"http://127.0.0.1:8000/rsvp?token={quote(token)}" if token else ""

        row_values = [
            name,
            group_label_map.get(group_type, "Solo"),
            party_size,
            status_label_map[status_key],
            attendance_label_map.get(attendance_type, "Vin d'honneur + repas"),
            rsvp_url,
        ]

        for col, value in enumerate(row_values, start=1):
            cell = guests_sheet.cell(row=row, column=col, value=value)
            cell.font = value_font
            cell.border = soft_border
            if col == 1 or col == 5 or col == 6:
                cell.alignment = left_aligned
            else:
                cell.alignment = centered

        status_cell = guests_sheet.cell(row=row, column=4)
        status_cell.fill = status_fill_map[status_key]
        if rsvp_url:
            link_cell = guests_sheet.cell(row=row, column=6)
            link_cell.hyperlink = rsvp_url
            link_cell.style = "Hyperlink"

    guests_total_row = max(guests_table_start_row, guests_table_start_row + len(guests))
    guests_total_label = guests_sheet.cell(row=guests_total_row, column=1, value="TOTAL PERSONNES")
    guests_total_value = guests_sheet.cell(row=guests_total_row, column=3, value=total_people)
    guests_total_confirm_rate = guests_sheet.cell(row=guests_total_row, column=4, value=confirmation_rate)
    for cell in (guests_total_label, guests_total_value, guests_total_confirm_rate):
        cell.font = Font(name="Calibri", size=11, bold=True, color="6B1433")
        cell.fill = total_fill
        cell.border = soft_border
        if cell.column == 1:
            cell.alignment = left_aligned
        else:
            cell.alignment = centered
    guests_total_confirm_rate.number_format = percent_format

    guests_sheet.column_dimensions["A"].width = 34
    guests_sheet.column_dimensions["B"].width = 11
    guests_sheet.column_dimensions["C"].width = 10
    guests_sheet.column_dimensions["D"].width = 13
    guests_sheet.column_dimensions["E"].width = 24
    guests_sheet.column_dimensions["F"].width = 48
    guests_sheet.freeze_panes = f"A{guests_table_start_row}"
    guests_sheet.auto_filter.ref = f"A{guests_table_header_row}:F{guests_total_row}"

    workbook.save(BUDGET_EXCEL_FILE)


def load_data_file() -> dict:
    with DATA_LOCK:
        if DATA_FILE.exists():
            try:
                parsed = json.loads(DATA_FILE.read_text(encoding="utf-8"))
                return normalize_data(parsed)
            except (json.JSONDecodeError, OSError):
                pass

        data = create_default_data()
        write_data_file(data)
        return data


def save_data_file(data: dict) -> None:
    normalized = normalize_data(data)
    with DATA_LOCK:
        write_data_file(normalized)
        write_budget_excel(normalized)


def load_admin_password() -> str:
    password = str(os.getenv("MARIAGE_ADMIN_PASSWORD", "")).strip()
    if password:
        print("Mot de passe admin: variable MARIAGE_ADMIN_PASSWORD")
        return password

    print(
        f"Mot de passe admin par défaut utilisé: {DEFAULT_ADMIN_PASSWORD} "
        "(définissez MARIAGE_ADMIN_PASSWORD pour le personnaliser)"
    )
    return DEFAULT_ADMIN_PASSWORD


class PlannerHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_admin_authorized(self) -> bool:
        if not ADMIN_PASSWORD:
            return False
        provided = self.headers.get("X-Admin-Key", "")
        return bool(provided) and provided == ADMIN_PASSWORD

    def _send_html(self, html_body: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = html_body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _render_rsvp_page(self, token: str, guest_name: str, status: str = "") -> str:
        name = escape(guest_name) if guest_name else "Cher invité"
        if status == "yes":
            title = "Réponse enregistrée: Oui"
            message = "Merci, votre présence est bien confirmée."
        elif status == "no":
            title = "Réponse enregistrée: Non"
            message = "Merci pour votre réponse, elle a bien été enregistrée."
        else:
            title = "Confirmez votre présence"
            message = "Merci de choisir votre réponse."

        yes_url = f"/rsvp?token={quote(token)}&status=yes"
        no_url = f"/rsvp?token={quote(token)}&status=no"

        return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)}</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(165deg, #fff3f2, #ffdedd);
      color: #4a0b14;
      padding: 18px;
    }}
    .card {{
      width: min(560px, 96vw);
      background: #fff;
      border: 1px solid rgba(224, 10, 38, 0.28);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 18px 36px rgba(224, 10, 38, 0.16);
      text-align: center;
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: 1.45rem;
      color: #e00a26;
    }}
    p {{
      margin: 0 0 16px;
      line-height: 1.45;
    }}
    .name {{
      font-weight: 700;
    }}
    .actions {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }}
    a {{
      display: inline-block;
      text-decoration: none;
      padding: 10px 12px;
      border-radius: 12px;
      font-weight: 700;
      border: 1px solid rgba(224, 10, 38, 0.6);
    }}
    .yes {{
      background: linear-gradient(145deg, #ffbd1c, #f65d08);
      color: #fff;
    }}
    .no {{
      background: #fff3f2;
      color: #a2182e;
    }}
  </style>
</head>
<body>
  <main class="card">
    <h1>{escape(title)}</h1>
    <p class="name">{name}</p>
    <p>{escape(message)}</p>
    <div class="actions">
      <a class="yes" href="{yes_url}">Oui, je serai présent(e)</a>
      <a class="no" href="{no_url}">Non, je ne pourrai pas venir</a>
    </div>
  </main>
</body>
</html>"""

    def _apply_rsvp_status(self, token: str, status: str) -> tuple[bool, str]:
        if status not in {"yes", "no"}:
            return False, ""

        data = load_data_file()
        for guest in data.get("guests", []):
            if str(guest.get("rsvpToken", "")).strip() == token:
                guest["status"] = status
                data["updatedAt"] = int(time.time() * 1000)
                save_data_file(data)
                return True, str(guest.get("name", "")).strip()
        return False, ""

    def _find_guest_by_token(self, token: str) -> str:
        data = load_data_file()
        for guest in data.get("guests", []):
            if str(guest.get("rsvpToken", "")).strip() == token:
                return str(guest.get("name", "")).strip()
        return ""

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/api/admin/check":
            if not self._is_admin_authorized():
                self._send_json({"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            self._send_json({"ok": True})
            return

        if path == "/api/data":
            if not self._is_admin_authorized():
                self._send_json({"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            self._send_json(load_data_file())
            return

        if path == "/rsvp":
            token = str(query.get("token", [""])[0]).strip()
            status = str(query.get("status", [""])[0]).strip().lower()
            if not token:
                self._send_html(self._render_rsvp_page("", "", ""))
                return

            if status in {"yes", "no"}:
                ok, guest_name = self._apply_rsvp_status(token, status)
                if ok:
                    self._send_html(self._render_rsvp_page(token, guest_name, status))
                    return
                self._send_html(self._render_rsvp_page(token, "", ""))
                return

            guest_name = self._find_guest_by_token(token)
            self._send_html(self._render_rsvp_page(token, guest_name, ""))
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/data":
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
            return

        if not self._is_admin_authorized():
            self._send_json({"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        save_data_file(payload)
        self._send_json({"ok": True})


def main() -> None:
    global ADMIN_PASSWORD
    ADMIN_PASSWORD = load_admin_password()
    data = load_data_file()
    write_budget_excel(data)
    handler = partial(PlannerHandler, directory=str(BASE_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("Serveur actif sur http://127.0.0.1:8000")
    print(f"Fichier de données: {DATA_FILE}")
    print(f"Fichier budget Excel: {BUDGET_EXCEL_FILE}")
    server.serve_forever()


if __name__ == "__main__":
    main()
