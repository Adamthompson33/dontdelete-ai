
import json
from pathlib import Path
from datetime import datetime

TODO_FILE = Path("todos.json")

def load_todos() -> list[dict]:
    if TODO_FILE.exists():
        return json.loads(TODO_FILE.read_text())
    return []

def add_todo(title: str, priority: str = "medium") -> dict:
    todos = load_todos()
    todo = {
        "id": len(todos) + 1,
        "title": title,
        "priority": priority,
        "created": datetime.now().isoformat(),
        "done": False,
    }
    todos.append(todo)
    TODO_FILE.write_text(json.dumps(todos, indent=2))
    return todo
