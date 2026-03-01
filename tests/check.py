"""
check.py — Format validation helper for firecrawl-simple test scripts.

Reads a JSON scrape response from stdin, prints a structured summary,
and exits with code 1 if any assertion fails.

Usage (called from test scripts):
    curl ... | python3 check.py [FORMAT1 FORMAT2 ...]

If format arguments are provided, the helper asserts:
  - Requested formats are present and non-empty
  - Non-requested formats are absent (not even as null/empty)
  - markdown never contains raw HTML (<!DOCTYPE / <html)
  - html is smaller than rawHtml when both are present
  - links is a list when requested
"""

import sys
import json


def main():
    requested_formats = set(sys.argv[1:]) if len(sys.argv) > 1 else set()

    try:
        d = json.load(sys.stdin)
    except Exception as e:
        print(f"FAIL | could not parse JSON: {e}")
        sys.exit(1)

    data = d.get("data") or {}
    md = data.get("markdown") or ""
    html = data.get("html") or ""
    rh = data.get("rawHtml") or ""
    links = data.get("links")  # None = absent, [] = present but empty
    screenshot = data.get("screenshot") or ""
    meta = data.get("metadata") or {}

    # ── Summary output (always printed) ──────────────────────────────────────
    md_is_html = md.strip().startswith("<!DOCTYPE") or md.strip().startswith("<html")
    print(f"success      : {d.get('success')}")
    print(f"error        : {str(d.get('error', ''))[:120]}")
    print(f"data keys    : {sorted(data.keys()) if data else '(none)'}")
    print(f"markdown len : {len(md)}")
    print(f"html len     : {len(html)}")
    print(f"rawHtml len  : {len(rh)}")
    print(
        f"links        : {'absent' if links is None else f'present ({len(links)} items)'}"
    )
    print(f"screenshot   : {'present' if screenshot else 'absent'}")
    print(f"md is HTML   : {md_is_html}")
    print(f"status code  : {meta.get('statusCode')}")
    print(f"title        : {(meta.get('title') or '')[:80]}")
    print(f"md preview   : {repr(md[:200])}")

    # ── Assertions (only when caller passes format args) ─────────────────────
    if not requested_formats:
        return

    failures = []

    # 1. success must be True
    if not d.get("success"):
        failures.append(f"success=False, error={d.get('error')}")

    # 2. status code must be 200
    if meta.get("statusCode") != 200:
        failures.append(f"statusCode={meta.get('statusCode')} (expected 200)")

    # 3. Requested formats must be present and non-empty
    format_key_map = {
        "markdown": ("markdown", md),
        "html": ("html", html),
        "rawHtml": ("rawHtml", rh),
        "screenshot": ("screenshot", screenshot),
    }
    for fmt in requested_formats:
        if fmt == "links":
            if links is None:
                failures.append("'links' format requested but key absent in response")
            elif len(links) == 0:
                failures.append("'links' format requested but list is empty")
        elif fmt in format_key_map:
            key, val = format_key_map[fmt]
            if key not in data or data[key] is None:
                failures.append(f"'{fmt}' format requested but key absent in response")
            elif len(val) == 0:
                failures.append(f"'{fmt}' format requested but value is empty string")

    # 4. Non-requested formats must be absent
    all_formats = {"markdown", "html", "rawHtml", "links", "screenshot"}
    for fmt in all_formats - requested_formats:
        if fmt == "links":
            if links is not None:
                failures.append(
                    f"'links' not requested but key is present in response (value={links!r})"
                )
        elif fmt == "screenshot":
            if screenshot:
                failures.append(
                    f"'screenshot' not requested but is non-empty in response"
                )
        elif fmt in format_key_map:
            key, val = format_key_map[fmt]
            if key in data and data[key] is not None:
                failures.append(
                    f"'{fmt}' not requested but key present in response (len={len(val)})"
                )

    # 5. markdown must never be raw HTML
    if "markdown" in requested_formats and md_is_html:
        failures.append(
            f"markdown field contains raw HTML (starts with doctype/html tag), len={len(md)}"
        )

    # 6. html must be smaller than rawHtml and must not contain <script>/<style>
    if "html" in requested_formats and "rawHtml" in requested_formats:
        if len(html) >= len(rh):
            failures.append(
                f"html ({len(html)}) is not smaller than rawHtml ({len(rh)})"
            )
        if "<script" in html:
            failures.append("html still contains <script> tags (should be stripped)")
        if "<style" in html:
            failures.append("html still contains <style> tags (should be stripped)")

    if "html" in requested_formats and "rawHtml" not in requested_formats:
        if "<script" in html:
            failures.append("html still contains <script> tags (should be stripped)")
        if "<style" in html:
            failures.append("html still contains <style> tags (should be stripped)")

    # ── Result ────────────────────────────────────────────────────────────────
    if failures:
        print(f"\nFAIL ({len(failures)} assertion(s) failed):")
        for f in failures:
            print(f"  ✗ {f}")
        sys.exit(1)
    else:
        print(f"\nPASS (all assertions for formats {sorted(requested_formats)} passed)")


if __name__ == "__main__":
    main()
