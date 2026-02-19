
from dataclasses import dataclass

@dataclass
class PomodoroState:
    work_minutes: int = 25
    break_minutes: int = 5
    long_break_minutes: int = 15
    cycles_completed: int = 0

    @property
    def is_long_break(self) -> bool:
        return self.cycles_completed > 0 and self.cycles_completed % 4 == 0

    @property
    def current_break(self) -> int:
        return self.long_break_minutes if self.is_long_break else self.break_minutes

    def complete_cycle(self) -> str:
        self.cycles_completed += 1
        break_time = self.current_break
        return f"Cycle {self.cycles_completed} done! Take a {break_time}min break."
