from datetime import datetime, timedelta

def get_day_number(date):
    """Get numerology day number, preserving master numbers."""
    date_str = date.strftime("%m%d%Y")
    total = sum(int(d) for d in date_str)
    
    # Check if initial sum is master number
    if total in [11, 22, 33]:
        return total
    
    # Reduce until single digit or master number
    while total > 9:
        if total in [11, 22, 33]:
            return total
        total = sum(int(d) for d in str(total))
    
    return total

# Find all 11 days in 2026
print("ALL 11 DAYS IN 2026:")
print("=" * 40)

start = datetime(2026, 1, 1)
eleven_days = []

for i in range(365):
    date = start + timedelta(days=i)
    num = get_day_number(date)
    if num == 11:
        eleven_days.append(date)
        print(f"{date.strftime('%Y-%m-%d (%A)')}")

print(f"\nTotal 11 days in 2026: {len(eleven_days)}")

# Verify Oct 10, 2025
print("\n\nVERIFICATION:")
oct10 = datetime(2025, 10, 10)
print(f"Oct 10, 2025: {oct10.strftime('%m%d%Y')} = {sum(int(d) for d in oct10.strftime('%m%d%Y'))} = Day {get_day_number(oct10)}")
