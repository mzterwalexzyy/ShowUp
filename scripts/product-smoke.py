"""UI regression fixtures only. These do not demonstrate real wallet or chain operations."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3000'
now = int(time.time() * 1000)
event = dict(id='ui-event', title='UI fixture event', state='OPEN', payment_mode='REFUNDABLE_DEPOSIT', amount_luna=100000,
             capacity=2, available_seats=1, starts_at=now+600000, ends_at=now+1800000,
             check_in_opens_at=now+600000, check_in_closes_at=now+1800000, cutoff=now+300000,
             participant_cancellation_policy='REFUND_BEFORE_CUTOFF')
wallet = 'NQ00 UI FIXTURE WALLET'
receipt = dict(reservation=dict(event, id='ui-pass', participant_wallet=wallet, state='HOLD_CREATED', hold_expires=now+600000, settlement_state='NONE'),
               evidence=dict(payments=[dict(state='UNVERIFIED', transaction_hash='a'*64)], credits=[], transfers=[]), refunds=[], history=[])
failures = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    for width in [320, 375, 430, 1280]:
        context = browser.new_context(viewport=dict(width=width, height=900))
        current_event = dict(event, state='CANCELLED')
        current_receipt = json.loads(json.dumps(receipt))
        session = dict(authenticated=True)
        def route_api(route):
            path = route.request.url.split('/api/', 1)[1]
            if path == 'me': data = dict(wallet=wallet, organizer=True, operator=True) if session['authenticated'] else None
            elif path == 'auth/challenge': data = dict(id='ui-login', message='UI fixture sign-in')
            elif path == 'auth/verify':
                session['authenticated'] = True
                data = dict(authenticated=True)
            elif path.endswith('/cancel'):
                current_receipt['reservation']['state'] = 'REFUND_PENDING'
                data = dict(state='REFUND_PENDING')
            elif path == 'host/events': data = [dict(event, state='DRAFT'), dict(event, id='cancelled', state='CANCELLED', ends_at=now-1000)]
            elif path.startswith('host/events/'): data = dict(event=dict(event, state='DRAFT'), attendees=[], summary=dict(confirmed=0, checkedIn=0, refundsToCreate=0))
            elif path.startswith('events/'): data = current_event
            elif path.startswith('reservations/'): data = current_receipt
            else: data = {}
            route.fulfill(status=200, content_type='application/json', body=json.dumps(data))
        context.route('**/api/**', route_api)
        page = context.new_page()
        page.on('pageerror', lambda err: failures.append(str(err)))
        def check(name, assertion):
            try: assertion()
            except Exception as err: failures.append(f'{width}px {name}: {str(err)[:220]}')
        def no_overflow():
            assert not page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth'), 'horizontal overflow'
        page.goto(BASE+'/e/ui-event', wait_until='networkidle')
        check('closed event registration', lambda: expect(page.get_by_role('button', name='Registration closed')).to_be_disabled())
        check('event layout', no_overflow)
        page.goto(BASE+'/r/ui-pass', wait_until='networkidle')
        check('submitted payment recovery', lambda: expect(page.get_by_role('button', name='Verify payment')).to_be_visible())
        check('repeat payment hidden', lambda: expect(page.get_by_role('button', name='Pay deposit now')).to_have_count(0))
        check('pass layout', no_overflow)
        current_receipt['reservation']['state'] = 'CONFIRMED'
        current_receipt['evidence']['credits'] = [dict(transaction_hash='a'*64)]
        page.reload(wait_until='networkidle')
        check('participant cancellation', lambda: expect(page.get_by_role('button', name='Cancel reservation', exact=True)).to_be_visible())
        if page.get_by_role('button', name='Cancel reservation', exact=True).count():
            page.get_by_role('button', name='Cancel reservation', exact=True).click()
            page.get_by_role('button', name='Cancel and request refund').click()
            check('cancellation result', lambda: expect(page.get_by_role('heading', name='Refund processing')).to_be_visible())
        page.goto(BASE+'/receipt/ui-pass', wait_until='networkidle')
        check('private export', lambda: expect(page.get_by_role('button', name='Export private receipt')).to_be_visible())
        if page.get_by_role('button', name='Export private receipt').count():
            with page.expect_download() as download:
                page.get_by_role('button', name='Export private receipt').click()
            saved = json.loads(Path(download.value.path()).read_text())
            assert saved['reservation']['id'] == 'ui-pass'
        check('receipt layout', no_overflow)
        page.goto(BASE+'/host', wait_until='networkidle')
        check('draft listing', lambda: expect(page.get_by_role('heading', name='draft campaigns', exact=True)).to_be_visible())
        check('host layout', no_overflow)
        page.goto(BASE+'/host/e/ui-event', wait_until='networkidle')
        check('open saved draft', lambda: expect(page.get_by_role('button', name='Open registration', exact=True)).to_be_visible())
        check('control room layout', no_overflow)
        current_receipt['reservation'].update(state='CONFIRMED', check_in_opens_at=now-60000, check_in_closes_at=now+3600000)
        page.goto(BASE+'/r/ui-pass', wait_until='networkidle')
        page.get_by_role('button', name='Scan venue QR').click()
        page.evaluate("Object.defineProperty(window, 'BarcodeDetector', {value:undefined,configurable:true})")
        page.get_by_role('button', name='Open camera', exact=True).click()
        check('camera fallback', lambda: expect(page.get_by_role('heading', name='Camera unavailable')).to_be_visible())
        page.get_by_label('Venue code').fill('fixture-venue-code')
        page.get_by_role('button', name='Continue with code').click()
        check('manual code path', lambda: expect(page.get_by_role('button', name='Sign check-in', exact=True)).to_be_visible())
        session['authenticated'] = False
        context.add_init_script("""window.fixtureSigns=0;window.nimiq={listAccounts:async()=>['NQ00 UI FIXTURE WALLET'],sign:async()=>{window.fixtureSigns++;return {publicKey:'fixture',signature:'fixture'}}};""")
        page.goto(BASE+'/host', wait_until='networkidle')
        page.get_by_role('button', name='Connect wallet', exact=True).first.click()
        check('explicit sign-in step', lambda: expect(page.get_by_role('button', name='Sign in to ShowUp', exact=True).first).to_be_visible())
        assert page.evaluate('window.fixtureSigns') == 0, 'sign-in prompted without a second tap'
        if page.get_by_role('button', name='Sign in to ShowUp', exact=True).count():
            page.get_by_role('button', name='Sign in to ShowUp', exact=True).first.click()
            check('host refresh after login', lambda: expect(page.get_by_role('heading', name='draft campaigns', exact=True)).to_be_visible())
        if width == 375:
            Path('docs/screenshots').mkdir(parents=True, exist_ok=True)
            page.screenshot(path='docs/screenshots/host-completion-375.png', full_page=True)
        context.close()
    browser.close()
if failures: raise AssertionError('\n'.join(failures))
print('Product UI fixtures passed at 320, 375, 430 and 1280 pixels. No page errors or horizontal overflow.')
