"""
LC Call Number Normalizer
=========================
Produces a fixed-width sortable string from a Library of Congress call number
so that lexicographic comparison gives correct LC shelf order.

LC call number anatomy:
  <LETTERS>  <NUMBER>[.<DECIMAL>]  [<CUTTER1>]  [<CUTTER2/WORK-MARK>]  [<YEAR>]  [<EXTRA>]

Examples handled:
  PZ7.1.K784 Sm 2020      → PZ  0007.1000 K000784 SM000000 2020
  PN2287.M18 A3 1991      → PN  2287.0000 M000018 A000003  1991
  Z52.3 .D5 1991          → Z   0052.3000 D000005 1991
  TL540.C646 P58 2001     → TL  0540.0000 C000646 P000058  2001
  RC509.8 .D66 2018       → RC  0509.8000 D000066 2018
  PZ8.1.N87 Bh3 1982      → PZ  0008.1000 N000087 BH000003 1982
  PZ7.1.H43134 Ye 2021    → PZ  0007.1000 H043134 YE000000 2021
  QA76.73.P98 H37 2019    → QA  0076.7300 P000098 H000037  2019
"""

import re
from typing import Optional

# ── Compiled patterns ─────────────────────────────────────────────────────────

# Matches the mandatory class prefix: 1–3 letters then the class number
_HEAD_RE = re.compile(
    r"^(?P<letters>[A-Z]{1,3})\s*(?P<num>\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

# Cutter with a leading dot: .K784  .D5  .H43134
_DOT_CUTTER_RE = re.compile(r"^\.([A-Z]\d*)$", re.IGNORECASE)

# Work mark / secondary cutter WITHOUT a dot: A3  Sm  Bh3  P58  Ye
_WORK_MARK_RE = re.compile(r"^([A-Z]+)(\d*)$", re.IGNORECASE)

# Four-digit year standing alone
_YEAR_RE = re.compile(r"^\d{4}$")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pad_class_num(s: str) -> str:
    """
    Zero-pad the class number so numbers sort before their decimal extensions
    and decimal portions sort lexicographically (treating them as ordinal suffixes,
    which is how LC orders them: 7.1 < 7.10 < 7.2).

    The decimal part is left-aligned in a 4-char field padded with spaces.
    Spaces (ASCII 32) sort before digits (ASCII 48), giving:
      '7.1   ' < '7.10  ' < '7.2   '  ✓
    """
    if "." in s:
        int_part, dec_part = s.split(".", 1)
        return f"{int(int_part):04d}.{dec_part:<4}"
    return f"{int(s):04d}.    "   # no decimal → effectively 0


def _pad_cutter(letters: str, digits: str) -> str:
    """
    Normalise a cutter segment: uppercase letters followed by the digit string
    RIGHT-padded with zeros to 6 characters.

    LC cutter digits represent a decimal fraction (.R89 = 0.89, .R458293 = 0.458293),
    so right-padding preserves correct shelf order:
      R89     -> R890000   (0.89)
      R458293 -> R458293   (0.458293) <- sorts before R890000 because 4 < 8
    """
    padded = (digits or "").ljust(6, "0")
    return f"{letters.upper()}{padded}"


# ── Public API ────────────────────────────────────────────────────────────────

def normalize_lc(call_number: str) -> Optional[str]:
    """
    Return a sortable normalised string for an LC call number, or None if the
    string cannot be parsed as an LC number.

    The returned string is safe for direct lexicographic (str) comparison and
    for storage in `ils_records.call_number_norm`.
    """
    if not call_number:
        return None

    s = call_number.strip()
    m = _HEAD_RE.match(s.upper())
    if not m:
        return None

    letters  = m.group("letters").upper()
    num_norm = _pad_class_num(m.group("num"))
    rest     = s[m.end():].strip()

    parts: list[str] = []
    for raw_token in rest.split():
        token = raw_token.strip()
        if not token:
            continue

        token_u = token.upper()

        # ── Cutter with leading dot: .K784  .D5 ──────────────────────────────
        if token.startswith(".") and len(token) > 1:
            inner = token[1:]
            cm = re.match(r"^([A-Z])(\d*)$", inner, re.IGNORECASE)
            if cm:
                parts.append(_pad_cutter(cm.group(1), cm.group(2)))
                continue

        # ── Four-digit year ───────────────────────────────────────────────────
        if _YEAR_RE.match(token):
            parts.append(token)
            continue

        # ── Work mark / secondary cutter (no dot): A3  Sm  Bh3  P58 ─────────
        cm = re.match(r"^([A-Z]+)(\d*)$", token, re.IGNORECASE)
        if cm:
            parts.append(_pad_cutter(cm.group(1), cm.group(2)))
            continue

        # ── Anything else (v.2, no.3, suppl., …) — preserve as upper ─────────
        parts.append(token_u)

    key = f"{letters:<3} {num_norm}"
    if parts:
        key += " " + " ".join(parts)

    return key
