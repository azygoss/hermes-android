"""CommandCode account limits for ``/usage`` and ``hermes usage --provider commandcode``.

Re-registers the bundled ``commandcode`` / ``commandcode-anthropic`` profiles unchanged, adding only
``fetch_account_usage``: the same ``/alpha/billing/*`` calls the Command Code CLI's ``/usage`` makes
(5-hour and weekly dollar windows, remaining monthly credits, plan and period end).
"""

import copy
import sys
from datetime import datetime, timezone

_BUNDLED = sys.modules.get("plugins.model_providers.commandcode")
_API = "https://api.commandcode.ai"
_PLANS = {"individual-go": "Go", "individual-goat": "GOAT", "individual-pro": "Pro", "individual-max": "Max",
          "individual-ultra": "Ultra", "individual-provider": "Provider", "teams-pro": "Teams Pro"}


def _parse_ts(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 1e12 else value, tz=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _fetch_account_usage(self, *, base_url=None, api_key=None):
    import httpx

    from agent.account_usage import AccountUsageSnapshot, AccountUsageWindow
    from hermes_cli.runtime_provider import resolve_runtime_provider
    from providers.base import _profile_user_agent

    token = str(api_key or "").strip()
    if not token:
        runtime = resolve_runtime_provider(requested=self.name, explicit_base_url=base_url)
        token = str(runtime.get("api_key", "") or "").strip()
    if not token:
        return None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": _profile_user_agent()}
    with httpx.Client(timeout=10.0, headers=headers) as client:
        credits = client.get(f"{_API}/alpha/billing/credits")
        credits.raise_for_status()
        body = credits.json() or {}
        sub = client.get(f"{_API}/alpha/billing/subscriptions")
        sub_data = ((sub.json() or {}).get("data") or {}) if sub.status_code == 200 else {}

    windows = []
    limits = body.get("windowLimits") or {}
    for key, label in (("fiveHour", "5-hour window"), ("weekly", "Weekly")):
        w = limits.get(key) or {}
        used, cap = w.get("used"), w.get("cap")
        if not isinstance(used, (int, float)) or not isinstance(cap, (int, float)) or cap <= 0:
            continue
        windows.append(AccountUsageWindow(
            label=label, used_percent=min(100.0, used / cap * 100), reset_at=_parse_ts(w.get("resetAt")),
            detail=f"${used:.2f} of ${cap:.2f}"))

    details = []
    c = body.get("credits") or {}
    balance = sum(float(c.get(k) or 0) for k in ("monthlyCredits", "purchasedCredits", "freeCredits"))
    if c:
        details.append(f"${balance:.2f} credits left")
    period_end = _parse_ts(sub_data.get("currentPeriodEnd"))
    if period_end:
        details.append(f"Plan renews {period_end.date().isoformat()}")
    return AccountUsageSnapshot(
        provider=self.name, source="commandcode_billing_api", fetched_at=datetime.now(timezone.utc),
        plan=_PLANS.get(str(sub_data.get("planId") or ""), sub_data.get("planId") or None),
        windows=tuple(windows), details=tuple(details), raw=body)


if _BUNDLED is not None:
    from providers import register_provider

    for _name in ("commandcode", "commandcode_anthropic"):
        _base = getattr(_BUNDLED, _name, None)
        if _base is None:
            continue
        _cls = type(f"{type(_base).__name__}WithUsage", (type(_base),), {"fetch_account_usage": _fetch_account_usage})
        _profile = copy.copy(_base)
        _profile.__class__ = _cls
        register_provider(_profile)
