"""Seed the demo dataset.

    python -m app.seed

All timestamps are relative to the moment the seed runs, so re-run it before a
demo to get fresh "today"/"yesterday" data. The script resets the database.

Score history snapshots are computed with the real scoring engine as of each
of the previous 7 days, so charts and "What Changed?" are consistent with the
stored activities (nothing is hard-coded).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from app.database import Base, SessionLocal, engine
from app.models import Account, AccountScore, Activity, Contact
from app.services.personas import persona_for_title
from app.services.scoring import calculate_score, is_target_industry
from app.services.time_utils import utcnow

HISTORY_DAYS = 7


def _a(t: str, *, d: float = 0, h: float = 0, m: float = 0, **meta: Any) -> dict[str, Any]:
    """Activity spec: type, time ago (days/hours/minutes), metadata."""
    return {"type": t, "ago": timedelta(days=d, hours=h, minutes=m), "meta": meta or None}


def _c(name: str, title: str | None, email: str | None) -> dict[str, Any]:
    return {"name": name, "title": title, "email": email}


ACCOUNTS: list[dict[str, Any]] = [
    # ---------------------------------------------------------- HERO ACCOUNT
    # Yesterday 61 -> today 86 (+25). Previous state: marketing engagement only.
    {
        "name": "Acme Technologies",
        "industry": "Technology",
        "employees": 1200,
        "website": "https://acme-tech.example.com",
        "contacts": [
            _c("Sarah Chen", "VP Engineering", "sarah.chen@acme-tech.example.com"),
            _c("Marcus Reed", "Engineering Manager", "marcus.reed@acme-tech.example.com"),
            _c("Priya Nair", "CFO", "priya.nair@acme-tech.example.com"),
        ],
        "activities": [
            _a("EMAIL_OPEN", d=9, campaign="Cloud Integration Webinar Invite"),
            _a("EMAIL_OPEN", d=6, h=2, campaign="Integration Patterns Newsletter"),
            _a("EMAIL_CLICK", d=6, campaign="Integration Patterns Newsletter", link="API connector guide"),
            _a("WEBSITE_VISIT", d=5, page="/solutions/cloud-integration"),
            _a("WEBSITE_VISIT", d=3, page="/blog/hybrid-cloud-integration-patterns"),
            _a("WEBSITE_VISIT", h=30, page="/docs/cloud-integration/api-connectors"),
            # --- new since yesterday ---
            _a("HIRING_ACTIVITY", h=20, detail="Posted 6 cloud platform engineering roles (integration & API)"),
            _a(
                "CONTENT_DOWNLOAD",
                h=16,
                asset_type="technical document",
                title="Cloud Integration Technical Architecture Guide",
                product="Cloud Integration",
            ),
            _a("PRICING_PAGE_VIEW", h=3, page="/pricing/cloud-integration", product="Cloud Integration"),
            _a(
                "DECISION_MAKER_ENGAGEMENT",
                h=1,
                m=30,
                contact_name="Sarah Chen",
                contact_title="VP Engineering",
                contact_email="sarah.chen@acme-tech.example.com",
                context="Cloud Integration product page",
                product="Cloud Integration",
            ),
        ],
    },
    # ------------------------------------------------ HIGH: demo request
    {
        "name": "Northwind Financial Group",
        "industry": "Financial Services",
        "employees": 3400,
        "website": "https://northwind-financial.example.com",
        "contacts": [
            _c("James Porter", "CTO", "j.porter@northwind-financial.example.com"),
            _c("Elena Ruiz", "Procurement Manager", "e.ruiz@northwind-financial.example.com"),
            _c("Olivia Grant", "CFO", "o.grant@northwind-financial.example.com"),
        ],
        "activities": [
            _a("EMAIL_OPEN", d=8, campaign="Forecasting Analytics for Finance Teams"),
            _a("EMAIL_CLICK", d=8, campaign="Forecasting Analytics for Finance Teams", link="Case study"),
            _a("PRODUCT_PAGE_VIEW", d=4, product="Data Analytics", page="/products/data-analytics"),
            _a("CONTENT_DOWNLOAD", d=3, asset_type="whitepaper", title="Real-time Risk Analytics Whitepaper", product="Data Analytics"),
            _a("PRODUCT_PAGE_VIEW", d=2, product="Data Analytics", page="/products/data-analytics/forecasting"),
            _a("PRICING_PAGE_VIEW", d=1, h=4, product="Data Analytics", page="/pricing/data-analytics"),
            _a("WEBSITE_VISIT", h=20, page="/customers/financial-services"),
            _a(
                "DEMO_REQUEST",
                h=6,
                contact_name="James Porter",
                contact_title="CTO",
                contact_email="j.porter@northwind-financial.example.com",
                product="Data Analytics",
                note="Requested a demo of forecasting dashboards",
            ),
            _a("WEBSITE_VISIT", h=5, page="/security/trust-center"),
        ],
    },
    # ---------------------------- HIGH: strong decision-maker engagement
    {
        "name": "Helix Health Systems",
        "industry": "Healthcare",
        "employees": 2500,
        "website": "https://helixhealth.example.org",
        "contacts": [
            _c("Dr. Amelia Brooks", "CISO", "a.brooks@helixhealth.example.org"),
            _c("Robert Kim", "CEO", "r.kim@helixhealth.example.org"),
            _c("Hannah Lee", "IT Director", "h.lee@helixhealth.example.org"),
        ],
        "activities": [
            _a("EMAIL_OPEN", d=10, campaign="Ransomware Readiness for Hospitals"),
            _a("EMAIL_CLICK", d=10, campaign="Ransomware Readiness for Hospitals", link="Threat report"),
            _a("CONTENT_DOWNLOAD", d=6, asset_type="report", title="Healthcare Threat Landscape Report", product="Cybersecurity"),
            _a("PRODUCT_PAGE_VIEW", d=4, product="Cybersecurity", page="/products/cybersecurity/zero-trust"),
            _a("PRODUCT_PAGE_VIEW", d=2, product="Cybersecurity", page="/products/cybersecurity/siem"),
            _a(
                "DECISION_MAKER_ENGAGEMENT",
                d=2,
                contact_name="Dr. Amelia Brooks",
                contact_title="CISO",
                contact_email="a.brooks@helixhealth.example.org",
                context="zero-trust webinar (attended live)",
                product="Cybersecurity",
            ),
            _a("PRICING_PAGE_VIEW", d=1, h=3, product="Cybersecurity", page="/pricing/cybersecurity"),
            _a(
                "DECISION_MAKER_ENGAGEMENT",
                h=22,
                contact_name="Robert Kim",
                contact_title="CEO",
                contact_email="r.kim@helixhealth.example.org",
                context="HIPAA compliance email thread",
                product="Cybersecurity",
            ),
            _a(
                "DECISION_MAKER_ENGAGEMENT",
                h=4,
                contact_name="Dr. Amelia Brooks",
                contact_title="CISO",
                contact_email="a.brooks@helixhealth.example.org",
                context="security architecture review page",
                product="Cybersecurity",
            ),
            _a("WEBSITE_VISIT", h=3, page="/customers/healthcare"),
        ],
    },
    # ------------------------------------------------ MEDIUM: analytics
    {
        "name": "Vertex Manufacturing",
        "industry": "Manufacturing",
        "employees": 800,
        "website": "https://vertex-mfg.example.com",
        "contacts": [
            _c("Linda Park", "COO", "linda.park@vertex-mfg.example.com"),
            _c("Carlos Mendes", "Director of Data Engineering", "c.mendes@vertex-mfg.example.com"),
        ],
        "activities": [
            _a("EMAIL_OPEN", d=12, campaign="Predictive Maintenance Analytics"),
            _a("EMAIL_OPEN", d=5, campaign="Manufacturing Dashboards Digest"),
            _a("EMAIL_CLICK", d=5, campaign="Manufacturing Dashboards Digest", link="Dashboard templates"),
            _a("CONTENT_DOWNLOAD", d=4, asset_type="ebook", title="Predictive Maintenance Dashboards eBook", product="Data Analytics"),
            _a("WEBSITE_VISIT", d=3, page="/solutions/manufacturing-analytics"),
            _a("PRODUCT_PAGE_VIEW", d=2, product="Data Analytics", page="/products/data-analytics"),
            _a("WEBSITE_VISIT", d=2, page="/customers/manufacturing"),
        ],
    },
    # ----------------------------------------- MEDIUM: no decision-maker
    {
        "name": "BlueRiver Logistics",
        "industry": "Logistics",
        "employees": 1500,
        "website": "https://blueriver-logistics.example.com",
        "contacts": [
            _c("Kevin Walsh", "Engineering Manager", "k.walsh@blueriver-logistics.example.com"),
            _c("Maria Santos", "Marketing Coordinator", "m.santos@blueriver-logistics.example.com"),
        ],
        "activities": [
            _a("EMAIL_CLICK", d=9, campaign="Integration Playbook", link="Connector catalogue"),
            _a("WEBSITE_VISIT", d=7, page="/solutions/cloud-integration"),
            _a("PRODUCT_PAGE_VIEW", d=5, product="Cloud Integration", page="/products/cloud-integration"),
            _a("CONTENT_DOWNLOAD", d=4, asset_type="guide", title="API Integration Checklist", product="Cloud Integration"),
            _a("WEBSITE_VISIT", d=3, page="/docs/connectors"),
            _a("PRODUCT_PAGE_VIEW", d=2, product="Cloud Integration", page="/products/cloud-integration/edi"),
            _a("PRICING_PAGE_VIEW", d=1, h=5, product="Cloud Integration", page="/pricing/cloud-integration"),
            _a("WEBSITE_VISIT", h=18, page="/blog/logistics-api-integration"),
        ],
    },
    # ----------------------------- HIGH: repeated activities + duplicates
    {
        "name": "Stratus Cloud Networks",
        "industry": "Technology",
        "employees": 450,
        "website": "https://stratus-cloud.example.net",
        "contacts": [
            _c("Nina Patel", "Head of Platform", "nina.patel@stratus-cloud.example.net"),
            _c("Owen Brooks", "Solutions Architect", "owen.brooks@stratus-cloud.example.net"),
        ],
        "activities": (
            [_a("PRICING_PAGE_VIEW", d=2, h=i * 3, product="Cloud Integration", page="/pricing") for i in range(6)]
            + [_a("PRODUCT_PAGE_VIEW", d=3, h=i * 5, product="Cloud Integration", page="/products/cloud-integration") for i in range(4)]
            + [_a("WEBSITE_VISIT", d=i, h=2, page=f"/docs/cloud-integration/page-{i}") for i in range(8)]
            + [_a("EMAIL_OPEN", d=i + 1, campaign="Cloud Integration Weekly") for i in range(5)]
            # Exact duplicates of the first pricing view: rejected by the dedupe key.
            + [_a("PRICING_PAGE_VIEW", d=2, h=0, product="Cloud Integration", page="/pricing") for _ in range(3)]
        ),
    },
    # ------------------------------------------ HIGH: no contacts at all
    {
        "name": "Cobalt Security Labs",
        "industry": "Technology",
        "employees": 300,
        "website": "https://cobalt-seclabs.example.io",
        "contacts": [],
        "activities": [
            _a("WEBSITE_VISIT", d=6, page="/solutions/zero-trust"),
            _a("CONTENT_DOWNLOAD", d=5, asset_type="whitepaper", title="Zero Trust Architecture Whitepaper", product="Cybersecurity"),
            _a("PRODUCT_PAGE_VIEW", d=4, product="Cybersecurity", page="/products/cybersecurity"),
            _a("WEBSITE_VISIT", d=3, page="/blog/soc2-automation"),
            _a("CONTENT_DOWNLOAD", d=2, asset_type="report", title="SIEM Buyer's Guide", product="Cybersecurity"),
            _a("PRODUCT_PAGE_VIEW", d=1, h=6, product="Cybersecurity", page="/products/cybersecurity/siem"),
            _a("PRICING_PAGE_VIEW", h=9, product="Cybersecurity", page="/pricing/cybersecurity"),
            _a("WEBSITE_VISIT", h=8, page="/customers/security-vendors"),
        ],
    },
    # ------------------------------------- MEDIUM: strong product signals
    {
        "name": "Summit Analytics",
        "industry": "Technology",
        "employees": 600,
        "website": "https://summit-analytics.example.com",
        "contacts": [
            _c("Grace Liu", "Head of Data", "grace.liu@summit-analytics.example.com"),
            _c("Ben Carter", "Data Engineering Manager", "ben.carter@summit-analytics.example.com"),
        ],
        "activities": [
            _a("EMAIL_OPEN", d=11, campaign="Modern BI Benchmark"),
            _a("EMAIL_CLICK", d=11, campaign="Modern BI Benchmark", link="Benchmark report"),
            _a("CONTENT_DOWNLOAD", d=10, asset_type="report", title="BI Dashboard Benchmark Report", product="Data Analytics"),
            _a("PRODUCT_PAGE_VIEW", d=8, product="Data Analytics", page="/products/data-analytics"),
            _a("EMAIL_OPEN", d=6, campaign="Data Warehouse Modernization"),
            _a("CONTENT_DOWNLOAD", d=5, asset_type="guide", title="Data Warehouse Reporting Guide", product="Data Analytics"),
            _a("PRODUCT_PAGE_VIEW", d=4, product="Data Analytics", page="/products/data-analytics/dashboards"),
            _a("PRODUCT_PAGE_VIEW", d=2, h=6, product="Data Analytics", page="/products/data-analytics/forecasting"),
            _a("WEBSITE_VISIT", d=2, h=5, page="/customers/analytics-teams"),
        ],
    },
    # ---------------------------- MEDIUM: trigger events, no product signal
    {
        "name": "Trident Aerospace",
        "industry": "Manufacturing",
        "employees": 4000,
        "website": "https://trident-aero.example.com",
        "contacts": [
            _c("Paul Novak", "CFO", "p.novak@trident-aero.example.com"),
            _c("Rachel Adams", "Procurement Manager", "r.adams@trident-aero.example.com"),
        ],
        "activities": [
            _a("COMPANY_EXPANSION", d=9, detail="Announced a new assembly plant in Ohio"),
            _a("HIRING_ACTIVITY", d=8, detail="Hiring 40+ roles across operations and finance"),
            _a("EMAIL_OPEN", d=6, campaign="Quarterly Customer Newsletter"),
            _a("EMAIL_CLICK", d=6, campaign="Quarterly Customer Newsletter", link="Customer stories"),
            _a("WEBSITE_VISIT", d=5, page="/about"),
        ],
    },
    # ------------------------------------------- LOW: small, weak signals
    {
        "name": "Orion Biotech",
        "industry": "Healthcare",
        "employees": 150,
        "website": "https://orion-bio.example.com",
        "contacts": [_c("Sophie Turner", "Lab Operations Manager", "s.turner@orion-bio.example.com")],
        "activities": [
            _a("EMAIL_OPEN", d=13, campaign="Research Data Security Tips"),
            _a("EMAIL_OPEN", d=12, campaign="Research Data Security Tips"),
            _a("WEBSITE_VISIT", d=11, page="/blog/lab-data-compliance"),
            _a("CONTENT_DOWNLOAD", d=10, asset_type="checklist", title="Lab Data Compliance Checklist"),
        ],
    },
    # ------------------------------------------------- LOW: old activity
    {
        "name": "Pinnacle Insurance",
        "industry": "Financial Services",
        "employees": 2000,
        "website": "https://pinnacle-insure.example.com",
        "contacts": [
            _c("Michael Grant", "VP of IT", "m.grant@pinnacle-insure.example.com"),
            _c("Laura Chen", "Procurement Manager", "l.chen@pinnacle-insure.example.com"),
        ],
        "activities": [
            _a("PRODUCT_PAGE_VIEW", d=45, product="Cloud Integration", page="/products/cloud-integration"),
            _a("PRICING_PAGE_VIEW", d=40, product="Cloud Integration", page="/pricing/cloud-integration"),
            _a("EMAIL_OPEN", d=25, campaign="Claims Integration Webinar"),
            _a("CONTENT_DOWNLOAD", d=20, asset_type="case study", title="Insurer Claims API Integration Case Study", product="Cloud Integration"),
            _a("WEBSITE_VISIT", d=18, page="/solutions/insurance"),
            _a("WEBSITE_VISIT", d=60, page="/"),
        ],
    },
    # ----------------------------------------- LOW: missing optional data
    {
        "name": "Evergreen Energy",
        "industry": "Energy",
        "employees": None,
        "website": None,
        "contacts": [_c("Alex Morgan", None, None)],
        "activities": [
            {"type": "WEBSITE_VISIT", "ago": timedelta(days=4), "meta": None},
            {"type": "EMAIL_OPEN", "ago": timedelta(days=4, hours=2), "meta": None},
            {"type": "EMAIL_CLICK", "ago": timedelta(days=4, hours=1), "meta": None},
        ],
    },
    # -------------------------------------------------- LOW: no activity
    {
        "name": "Lumen Media Co",
        "industry": "Media",
        "employees": 90,
        "website": "https://lumen-media.example.com",
        "contacts": [_c("Jordan Blake", "Marketing Director", "j.blake@lumen-media.example.com")],
        "activities": [],
    },
    # ----------------------------------------- LOW: insufficient activity
    {
        "name": "Keystone Construction Group",
        "industry": "Construction",
        "employees": 700,
        "website": "https://keystone-construction.example.com",
        "contacts": [_c("Tony Russo", "Site Operations Manager", "t.russo@keystone-construction.example.com")],
        "activities": [_a("EMAIL_OPEN", d=5, campaign="Quarterly Customer Newsletter")],
    },
    # --------------------------------------- LOW: future-dated activity
    {
        "name": "Nimbus Education",
        "industry": "Education",
        "employees": 1100,
        "website": "https://nimbus-edu.example.edu",
        "contacts": [_c("Dana White", "CIO", "d.white@nimbus-edu.example.edu")],
        "activities": [
            _a("EMAIL_OPEN", d=9, campaign="Campus Cloud Migration"),
            _a("WEBSITE_VISIT", d=9, page="/solutions/education"),
            # Bad data from an upstream integration: timestamps in the future.
            _a("DEMO_REQUEST", d=-10, contact_name="Dana White", contact_title="CIO", product="Cloud Integration"),
            _a("PRICING_PAGE_VIEW", d=-3, product="Cloud Integration", page="/pricing"),
        ],
    },
]


def seed(now: datetime | None = None, reset: bool = True, verbose: bool = True) -> dict[str, int]:
    now = now or utcnow()
    if reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    stats = {"accounts": 0, "contacts": 0, "activities": 0, "duplicates_skipped": 0, "snapshots": 0}
    with SessionLocal() as db:
        for spec in ACCOUNTS:
            account = Account(
                name=spec["name"],
                industry=spec["industry"],
                employee_count=spec["employees"],
                website=spec["website"],
                created_at=now - timedelta(days=90),
            )
            account.target_industry = is_target_industry(account) if account.industry else None
            db.add(account)
            db.flush()
            stats["accounts"] += 1

            for c in spec["contacts"]:
                db.add(
                    Contact(
                        account_id=account.id,
                        name=c["name"],
                        job_title=c["title"],
                        email=c["email"],
                        persona=persona_for_title(c["title"]),
                    )
                )
                stats["contacts"] += 1

            seen_keys: set[str] = set()
            activities: list[Activity] = []
            for a in spec["activities"]:
                activity = Activity(
                    account_id=account.id,
                    activity_type=a["type"],
                    timestamp=now - a["ago"],
                    metadata=a["meta"],
                )
                if activity.dedupe_key in seen_keys:
                    stats["duplicates_skipped"] += 1
                    continue
                seen_keys.add(activity.dedupe_key)
                activities.append(activity)
                db.add(activity)
            stats["activities"] += len(activities)

            # Daily history computed with the real engine "as of" each day.
            for days_ago in range(HISTORY_DAYS, -1, -1):
                as_of = now - timedelta(days=days_ago)
                s = calculate_score(account, activities, as_of)
                db.add(
                    AccountScore(
                        account_id=account.id,
                        fit_score=s.fit,
                        intent_score=s.intent,
                        engagement_score=s.engagement,
                        recency_score=s.recency,
                        total_score=s.total,
                        calculated_at=as_of,
                    )
                )
                stats["snapshots"] += 1
                if verbose and days_ago in (1, 0):
                    label = "yesterday" if days_ago else "today"
                    print(f"  {account.name:<30} {label:<9} {s.total:>3}  ({s.priority})")
        db.commit()
    if verbose:
        print(
            f"Seeded {stats['accounts']} accounts, {stats['contacts']} contacts, "
            f"{stats['activities']} activities ({stats['duplicates_skipped']} exact duplicates skipped), "
            f"{stats['snapshots']} score snapshots."
        )
    return stats


if __name__ == "__main__":
    seed()
