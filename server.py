from __future__ import annotations

import json
import os
import threading
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data.json"
DATA_LOCK = threading.Lock()
ADMIN_PASSWORD = os.getenv("MARIAGE_ADMIN_PASSWORD", "Vieg0lito")

DEFAULT_DATA = {
    "budgetGoal": 15000,
    "budgetItems": [],
    "tasks": [],
    "guests": [],
    "updatedAt": 0,
}

VALID_GUEST_STATUS = {"pending", "yes", "no"}


def create_default_data() -> dict:
    return {
        "budgetGoal": DEFAULT_DATA["budgetGoal"],
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
            if not name:
                continue
            cleaned_guests.append(
                {
                    "id": str(guest.get("id", "")).strip() or "guest",
                    "name": name,
                    "status": status if status in VALID_GUEST_STATUS else "pending",
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

    def do_GET(self) -> None:
        if self.path == "/api/admin/check":
            if not self._is_admin_authorized():
                self._send_json({"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            self._send_json({"ok": True})
            return

        if self.path == "/api/data":
            if not self._is_admin_authorized():
                self._send_json({"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            self._send_json(load_data_file())
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
