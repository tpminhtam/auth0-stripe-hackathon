#!/usr/bin/env python3
"""Proves the loupe hero animation stays in sync.

Reads app/globals.css and components/loupe-stage.tsx and asserts, for every
item, that (a) its `--at` equals the moment the lens arrives, (b) its icon and
price-tag reveal windows fall entirely inside the lens dwell, and (c) its
waypoint is item-90px (half the 180px lens).

Screenshots CANNOT verify this: headless Chrome's --virtual-time-budget
advances delayed and undelayed animations differently and will show a false
desync. Run this instead:  python3 scripts/check-loupe-timing.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
css = (root / 'app/globals.css').read_text()
tsx = (root / 'components/loupe-stage.tsx').read_text()
LOOP = 22.0

path = re.search(r"@keyframes loupe-path \{(.*?)\n\}", css, re.S).group(1)
blocks = re.findall(r"([\d.%,\s]+)\{\s*transform:\s*(translate\([^)]*\));", path)
dwells = []
for pcts, _ in blocks:
    ps = [float(p.strip().rstrip('%')) for p in pcts.replace('\n', ' ').split(',') if p.strip()]
    if len(ps) == 2:
        dwells.append((ps[0] / 100 * LOOP, ps[1] / 100 * LOOP))
dwells.sort()

def lit_window(name):
    k = re.search(r"@keyframes %s \{(.*?)\n\}" % name, css, re.S).group(1)
    on = []
    for pcts, body in re.findall(r"([\d.%,\s]+)\{(.*?)\}", k, re.S):
        ps = [float(p.strip().rstrip('%')) for p in pcts.replace('\n', ' ').split(',') if p.strip()]
        o = re.search(r"opacity:\s*([\d.]+)", body)
        if o and float(o.group(1)) >= 0.99:
            on += ps
    return min(on) / 100 * LOOP, max(on) / 100 * LOOP

icon_lit, tag_lit = lit_window('found'), lit_window('found-tag')
ats = [float(a.rstrip('s')) for a in re.findall(r"at: '([\d.]+)s'", tsx)]
xs = [int(v) for v in re.findall(r"x: (\d+)", tsx)]
ys = [int(v) for v in re.findall(r"y: (\d+)", tsx)]
wps, seen = [], set()
for a, b in re.findall(r"translate\((\d+)px, (\d+)px\)", path):
    if (a, b) not in seen:
        seen.add((a, b)); wps.append((int(a), int(b)))

ok = True
for i, (at, x, y) in enumerate(zip(ats, xs, ys)):
    d0, d1 = dwells[i]
    il = (at + icon_lit[0], at + icon_lit[1])
    tl = (at + tag_lit[0], at + tag_lit[1])
    checks = {
        'arrival': abs(at - d0) < 0.01,
        'icon':    d0 <= il[0] and il[1] <= d1,
        'tag':     d0 <= tl[0] and tl[1] <= d1,
        'waypoint': wps[i] == (x - 90, y - 90),
    }
    ok &= all(checks.values())
    bad = [k for k, v in checks.items() if not v]
    print(f"stop {i}: dwell {d0:5.2f}-{d1:5.2f}s  icon {il[0]:5.2f}-{il[1]:5.2f}  "
          f"tag {tl[0]:5.2f}-{tl[1]:5.2f}  {'ok' if not bad else 'FAIL: ' + ','.join(bad)}")

print('\nloupe timing: ' + ('IN SYNC' if ok else 'BROKEN'))
sys.exit(0 if ok else 1)
