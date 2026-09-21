"""Build backend/data/company_problems.json from a checkout of
https://github.com/snehasishroy/leetcode-companywise-interview-questions

Usage:
    git clone --depth 1 https://github.com/snehasishroy/leetcode-companywise-interview-questions.git /tmp/cw
    python scripts/build_company_dataset.py /tmp/cw

The output is a compact, bundled dataset so the backend seed step never has to
hit the network at boot:
    {
      "problems":  { "<slug>": ["<title>", "<Easy|Medium|Hard>"], ... },
      "companies": { "<Display Name>": ["<slug>", ...] }   # ordered by frequency desc
    }
"""
import csv
import json
import os
import re
import sys

# Display name -> repo folder. Existing seed companies keep their names; the
# rest are popular interview targets, added to widen company coverage.
EXISTING = {
    "Google": "google", "Amazon": "amazon", "Microsoft": "microsoft", "Meta": "meta",
    "Apple": "apple", "Adobe": "adobe", "Uber": "uber", "Flipkart": "flipkart",
    "Goldman Sachs": "goldman-sachs", "Atlassian": "atlassian", "Salesforce": "salesforce",
    "Walmart Labs": "walmart-labs", "Sabre": "sabre", "Couchbase": "couchbase",
    "Oracle": "oracle", "Cisco": "cisco", "Intuit": "intuit", "ServiceNow": "servicenow",
    "PayPal": "paypal", "VMware": "vmware", "Qualcomm": "qualcomm", "Samsung": "samsung",
    "Zoho": "zoho", "Freshworks": "freshworks", "Swiggy": "swiggy", "Zomato": "zomato",
    "Paytm": "paytm", "PhonePe": "phonepe", "Razorpay": "razorpay", "LinkedIn": "linkedin",
    "Bloomberg": "bloomberg", "Nutanix": "nutanix", "Intel": "intel",
    "TCS Digital": "tcs", "Cognizant": "cognizant",
}

EXTRA = {
    "Netflix": "netflix", "Airbnb": "airbnb", "Stripe": "stripe", "Databricks": "databricks",
    "Snowflake": "snowflake", "Nvidia": "nvidia", "Tesla": "tesla", "TikTok": "tiktok",
    "ByteDance": "bytedance", "DoorDash": "doordash", "Lyft": "lyft", "Pinterest": "pinterest",
    "Snap": "snapchat", "Dropbox": "dropbox", "Palantir": "palantir",
    "Coinbase": "coinbase", "Robinhood": "robinhood", "Citadel": "citadel",
    "Jane Street": "jane-street", "Two Sigma": "two-sigma", "JPMorgan": "jpmorgan",
    "Morgan Stanley": "morgan-stanley", "American Express": "american-express",
    "Visa": "visa", "Mastercard": "mastercard", "Infosys": "infosys", "Wipro": "wipro",
    "Accenture": "accenture", "Capgemini": "capgemini", "Deloitte": "deloitte", "IBM": "ibm",
    "SAP": "sap", "Shopify": "shopify", "Spotify": "spotify", "Yahoo": "yahoo", "eBay": "ebay",
    "Expedia": "expedia", "Myntra": "myntra", "CRED": "cred", "Meesho": "meesho",
    "Ola": "ola", "MathWorks": "mathworks", "Arista Networks": "arista-networks",
    "Rubrik": "rubrik", "D. E. Shaw": "de-shaw", "Directi": "directi",
    "ThoughtWorks": "thoughtworks", "Booking.com": "bookingcom", "Airtel": "airtel",
    "Twilio": "twilio", "Square": "square", "Roblox": "roblox", "Zillow": "zillow",
    "Texas Instruments": "texas-instruments", "AMD": "amd", "Broadcom": "broadcom",
}


def slug_from_url(url, title):
    m = re.search(r"/problems/([^/?#]+)", url or "")
    if m:
        return m.group(1).strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")


def load_company(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            slug = slug_from_url(row.get("URL"), row.get("Title"))
            if not slug:
                continue
            diff = (row.get("Difficulty") or "Medium").strip()
            if diff not in ("Easy", "Medium", "Hard"):
                diff = "Medium"
            try:
                freq = float((row.get("Frequency %") or "0").strip().rstrip("%"))
            except ValueError:
                freq = 0.0
            rows.append((freq, slug, (row.get("Title") or slug).strip(), diff))
    rows.sort(key=lambda r: -r[0])
    return rows


def main(repo, out):
    problems, companies, missing = {}, {}, []
    for name, folder in {**EXISTING, **EXTRA}.items():
        path = os.path.join(repo, folder, "all.csv")
        if not os.path.isfile(path):
            missing.append(name)
            continue
        seen, slugs = set(), []
        for _f, slug, title, diff in load_company(path):
            if slug in seen:
                continue
            seen.add(slug)
            slugs.append(slug)
            problems.setdefault(slug, [title, diff])
        companies[name] = slugs
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"problems": problems, "companies": companies}, f, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    print(f"companies={len(companies)} unique_problems={len(problems)} links={sum(map(len, companies.values()))}")
    if missing:
        print("missing (skipped):", ", ".join(missing))


if __name__ == "__main__":
    repo = sys.argv[1] if len(sys.argv) > 1 else "/tmp/cw"
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "backend", "data", "company_problems.json")
    main(repo, os.path.abspath(out))
