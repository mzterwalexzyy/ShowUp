from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
EVENT = "a94f21a6-7116-4ca9-89ce-e8ccc3fecd1d"
OUT = Path("docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

routes = {
    "home": "/",
    "event": f"/e/{EVENT}",
    "host": "/host",
    "new-event": "/host/new",
}
viewports = [(320, 700), (375, 812), (430, 932), (1280, 800)]
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    )
    for width, height in viewports:
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.on("console", lambda msg, w=width: errors.append(f"{w} console {msg.type}: {msg.text}") if msg.type == "error" else None)
        page.on("pageerror", lambda error, w=width: errors.append(f"{w} page: {error}"))
        for name, route in routes.items():
            response = page.goto(BASE + route, wait_until="networkidle")
            assert response and response.ok, f"{route} returned {response.status if response else 'no response'}"
            overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
            assert not overflow, f"horizontal overflow at {width}px on {route}"
            if width in (320, 375, 430, 1280):
                page.screenshot(path=str(OUT / f"{name}-{width}.png"), full_page=True)
        page.goto(BASE + "/diagnostic", wait_until="networkidle")
        assert page.url.rstrip("/") == BASE, "unauthorized diagnostic route was not redirected"
        context.close()
    browser.close()

if errors:
    raise AssertionError("Browser errors:\n" + "\n".join(errors))
print(f"Checked {len(routes)} routes at {len(viewports)} viewport sizes with no console errors or horizontal overflow.")
