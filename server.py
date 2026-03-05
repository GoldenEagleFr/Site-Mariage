from __future__ import annotations

import json
import os
import threading
import time
from html import escape
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
DATA_LOCK = threading.Lock()
ADMIN_PASSWORD = os.getenv("MARIAGE_ADMIN_PASSWORD", "Vieg0lito")

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
        name = escape(guest_name) if guest_name else "Cher invite"
        if status == "yes":
            title = "Reponse enregistree: Oui"
            message = "Merci, votre presence est bien confirmee."
        elif status == "no":
            title = "Reponse enregistree: Non"
            message = "Merci pour votre reponse, elle a bien ete enregistree."
        else:
            title = "Confirmez votre presence"
            message = "Merci de choisir votre reponse."

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
      <a class="yes" href="{yes_url}">Oui, je serai present(e)</a>
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
    load_data_file()
    handler = partial(PlannerHandler, directory=str(BASE_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("Serveur actif sur http://127.0.0.1:8000")
    print(f"Fichier de donnees: {DATA_FILE}")
    print("Mot de passe admin: variable MARIAGE_ADMIN_PASSWORD (defaut: Vieg0lito)")
    server.serve_forever()


if __name__ == "__main__":
    main()
