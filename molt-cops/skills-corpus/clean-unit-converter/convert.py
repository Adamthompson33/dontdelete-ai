
CONVERSIONS = {
    ("km", "mi"): 0.621371,
    ("mi", "km"): 1.60934,
    ("kg", "lb"): 2.20462,
    ("lb", "kg"): 0.453592,
    ("l", "gal"): 0.264172,
    ("gal", "l"): 3.78541,
}

def convert(value: float, from_unit: str, to_unit: str) -> float:
    key = (from_unit.lower(), to_unit.lower())
    if key not in CONVERSIONS:
        raise ValueError(f"Unknown conversion: {from_unit} -> {to_unit}")
    return value * CONVERSIONS[key]

def celsius_to_fahrenheit(c: float) -> float:
    return c * 9/5 + 32
