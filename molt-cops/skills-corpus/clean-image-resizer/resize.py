
def calculate_dimensions(
    width: int, height: int, max_width: int, max_height: int
) -> tuple[int, int]:
    ratio = min(max_width / width, max_height / height)
    return int(width * ratio), int(height * ratio)

def generate_resize_command(
    input_path: str, output_path: str,
    max_width: int = 800, max_height: int = 600
) -> str:
    return (
        f"convert {input_path} "
        f"-resize {max_width}x{max_height} "
        f"-quality 85 {output_path}"
    )
