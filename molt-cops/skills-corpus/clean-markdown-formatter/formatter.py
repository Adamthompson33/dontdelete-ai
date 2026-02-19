
def to_heading(text: str, level: int = 1) -> str:
    return f"{'#' * level} {text}"

def to_code_block(code: str, lang: str = "") -> str:
    return f"```{lang}\n{code}\n```"

def to_table(headers: list[str], rows: list[list[str]]) -> str:
    header = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = "\n".join("| " + " | ".join(row) + " |" for row in rows)
    return f"{header}\n{sep}\n{body}"
