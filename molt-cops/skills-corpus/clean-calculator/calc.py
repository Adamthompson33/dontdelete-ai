
import math

def calculate(expression: str) -> float:
    """Safely evaluate a math expression."""
    allowed = set("0123456789+-*/.() ")
    if not all(c in allowed for c in expression):
        raise ValueError("Invalid characters in expression")
    return eval(expression, {"__builtins__": {}}, {"math": math})

def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("Factorial undefined for negative numbers")
    return math.factorial(n)
