"""
Numerology Module for Trading
Based on GG33 methodology

Key insight: 11 days (master number) are historically volatile.
Many major market crashes happen on 11 days.

Examples:
- Oct 10, 2025: 1+0+1+0+2+0+2+5 = 11 → $19B liquidation
- Black Monday 1987: Oct 19 = 1+0+1+9+1+9+8+7 = 36 = 9 (but 19 = 1+9 = 10 = 1)
- 9/11 attacks: obvious
- 2008 crash intensified on Nov 20 = 11+20+2008 = 11+2+1 = 14... hmm

Let's track 11 days specifically.
"""

from datetime import datetime, timedelta


def calculate_day_number(date: datetime) -> int:
    """
    Calculate the numerology day number for a given date.
    
    Method: Add all digits of the date until single digit (except master numbers 11, 22, 33)
    Example: Oct 10, 2025 = 1+0+1+0+2+0+2+5 = 11
    """
    # Format: MMDDYYYY
    date_str = date.strftime("%m%d%Y")
    
    # Sum all digits
    total = sum(int(d) for d in date_str)
    
    # Keep master numbers (11, 22, 33)
    if total in [11, 22, 33]:
        return total
    
    # Reduce to single digit
    while total > 9:
        total = sum(int(d) for d in str(total))
        if total in [11, 22, 33]:
            return total
    
    return total


def is_eleven_day(date: datetime = None) -> bool:
    """Check if a date is an 11 day (high volatility expected)."""
    if date is None:
        date = datetime.now()
    return calculate_day_number(date) == 11


def is_master_number_day(date: datetime = None) -> tuple:
    """Check if date is a master number day (11, 22, or 33)."""
    if date is None:
        date = datetime.now()
    num = calculate_day_number(date)
    return num in [11, 22, 33], num


def get_upcoming_eleven_days(days_ahead: int = 30) -> list:
    """Find all 11 days in the next N days."""
    eleven_days = []
    today = datetime.now()
    
    for i in range(days_ahead):
        check_date = today + timedelta(days=i)
        if is_eleven_day(check_date):
            eleven_days.append(check_date.strftime("%Y-%m-%d (%A)"))
    
    return eleven_days


def get_risk_level(date: datetime = None) -> dict:
    """
    Get risk level for a given day based on numerology.
    
    Returns dict with risk assessment and recommendations.
    """
    if date is None:
        date = datetime.now()
    
    day_num = calculate_day_number(date)
    is_master, master_num = is_master_number_day(date)
    
    if day_num == 11:
        return {
            'day_number': 11,
            'risk_level': 'HIGH',
            'description': 'Master Number 11 - Emotional/chaotic energy',
            'historical': 'Oct 10 2025 crash, 9/11, many flash crashes',
            'recommendation': 'Reduce position size, have crash catchers ready, expect volatility',
            'leverage_multiplier': 0.5  # Cut leverage in half
        }
    elif day_num == 22:
        return {
            'day_number': 22,
            'risk_level': 'MEDIUM-HIGH', 
            'description': 'Master Number 22 - Master Builder, big moves possible',
            'recommendation': 'Stay alert, can go either direction dramatically',
            'leverage_multiplier': 0.75
        }
    elif day_num == 33:
        return {
            'day_number': 33,
            'risk_level': 'MEDIUM',
            'description': 'Master Number 33 - Master Teacher',
            'recommendation': 'Market may teach lessons, stay humble',
            'leverage_multiplier': 0.8
        }
    elif day_num in [4, 8]:
        return {
            'day_number': day_num,
            'risk_level': 'ELEVATED',
            'description': f'Number {day_num} - Karmic/restriction energy',
            'recommendation': 'Be cautious with new positions',
            'leverage_multiplier': 0.9
        }
    else:
        return {
            'day_number': day_num,
            'risk_level': 'NORMAL',
            'description': f'Number {day_num} day',
            'recommendation': 'Trade normally',
            'leverage_multiplier': 1.0
        }


# === CRASH DETECTION ===

def detect_crash_conditions(
    current_price: float,
    price_5min_ago: float,
    volume_current: float,
    volume_average: float,
    funding_rate: float
) -> dict:
    """
    Detect if crash conditions are present.
    
    Returns dict with crash assessment.
    """
    price_change_pct = ((current_price - price_5min_ago) / price_5min_ago) * 100
    volume_multiple = volume_current / volume_average if volume_average > 0 else 1
    
    signals = {
        'price_dumping': price_change_pct < -3,  # Down 3%+ in 5 min
        'volume_spike': volume_multiple > 5,      # 5x normal volume
        'funding_negative': funding_rate < -0.01, # Shorts paying
        'extreme_dump': price_change_pct < -5,    # Down 5%+ (serious)
        'extreme_volume': volume_multiple > 10,   # 10x volume (cascade)
    }
    
    crash_score = sum([
        signals['price_dumping'] * 1,
        signals['volume_spike'] * 1,
        signals['funding_negative'] * 0.5,
        signals['extreme_dump'] * 2,
        signals['extreme_volume'] * 2,
    ])
    
    if crash_score >= 4:
        status = 'CRASH_ACTIVE'
        action = 'DEPLOY_BOTTOM_FISHER'
    elif crash_score >= 2:
        status = 'CRASH_WARNING'
        action = 'PREPARE_CRASH_CATCHERS'
    else:
        status = 'NORMAL'
        action = 'CONTINUE_STRATEGY'
    
    return {
        'status': status,
        'action': action,
        'crash_score': crash_score,
        'signals': signals,
        'price_change_5min': f"{price_change_pct:.2f}%",
        'volume_multiple': f"{volume_multiple:.1f}x"
    }


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    
    print("=" * 50)
    print("NUMEROLOGY TRADING ANALYSIS")
    print("=" * 50)
    
    # Today's analysis
    today = datetime.now()
    risk = get_risk_level(today)
    
    print(f"\nTODAY: {today.strftime('%Y-%m-%d')}")
    print(f"Day Number: {risk['day_number']}")
    print(f"Risk Level: {risk['risk_level']}")
    print(f"Description: {risk['description']}")
    print(f"Recommendation: {risk['recommendation']}")
    print(f"Leverage Multiplier: {risk['leverage_multiplier']}x")
    
    # Verify Oct 10, 2025
    oct_10 = datetime(2025, 10, 10)
    oct_risk = get_risk_level(oct_10)
    print(f"\nOCT 10, 2025 (the crash):")
    print(f"Day Number: {oct_risk['day_number']}")
    print(f"Risk Level: {oct_risk['risk_level']}")
    
    # Upcoming 11 days
    print(f"\nUPCOMING 11 DAYS (next 60 days):")
    eleven_days = get_upcoming_eleven_days(60)
    for day in eleven_days:
        print(f"   - {day}")
    
    print("\n" + "=" * 50)
