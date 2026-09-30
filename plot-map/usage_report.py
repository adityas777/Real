#!/usr/bin/env python3
"""Summarise the admin's usage log (usage-log.csv, written by server.py).

    python usage_report.py            # everything logged
    python usage_report.py 2026-10    # one month

Answers the question behind the office trial (deploy/office/README.md): how often, and for how
long, is the admin actually used — the input for "keep it in the office or move it to EC2?".
A SESSION is a run of activity with no gap longer than SESSION_GAP_MIN minutes. Hours are active
minutes (a minute counts if any real request arrived in it), so they understate a session a little.
"""
import csv
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage-log.csv")
SESSION_GAP_MIN = 30


def main():
    month = sys.argv[1] if len(sys.argv) > 1 else ""
    if not os.path.exists(LOG):
        print("No usage-log.csv yet - it is created the first time someone uses the admin.")
        return
    minutes = defaultdict(set)                   # computer -> {datetime}
    with open(LOG, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if month and not row["minute"].startswith(month):
                continue
            try:
                minutes[row["computer"]].add(datetime.strptime(row["minute"], "%Y-%m-%d %H:%M"))
            except (KeyError, ValueError):
                continue
    every = sorted(m for s in minutes.values() for m in s)
    if not every:
        print("No usage logged" + (f" in {month}." if month else "."))
        return

    sessions, start, prev = [], every[0], every[0]
    for m in every[1:]:
        if m - prev > timedelta(minutes=SESSION_GAP_MIN):
            sessions.append((start, prev)); start = m
        prev = m
    sessions.append((start, prev))

    days = sorted({m.date() for m in every})
    active = len(set(every))
    print(f"Admin usage {'in ' + month if month else '(all logged)'}: {every[0]:%d %b %Y} - {every[-1]:%d %b %Y}")
    print(f"  Days used        : {len(days)}")
    print(f"  Sessions         : {len(sessions)}  (a gap of more than {SESSION_GAP_MIN} min starts a new one)")
    print(f"  Active time      : {active // 60} h {active % 60} min")
    span = sum(((b - a).total_seconds() / 60 + 1) for a, b in sessions)
    print(f"  Session time     : {int(span) // 60} h {int(span) % 60} min (first to last request of each session)")
    # What EC2 sleep/wake would bill: each session plus the 60-minute idle wait before it stops.
    print(f"  EC2 would run    : ~{(span + 60 * len(sessions)) / 60:.0f} h (sessions + 60 min idle each)")
    print("  By computer      :")
    for comp, ms in sorted(minutes.items(), key=lambda kv: -len(kv[1])):
        print(f"    {comp or '?':<18} {len(ms) // 60} h {len(ms) % 60} min active")
    print("  Sessions:")
    for a, b in sessions:
        print(f"    {a:%a %d %b  %H:%M} - {b:%H:%M}  ({int((b - a).total_seconds() // 60) + 1} min)")


if __name__ == "__main__":
    main()
