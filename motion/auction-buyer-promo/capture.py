"""Capture the existing AuctionPage buyer journey through its real controls."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5183/motion/auction-buyer-promo/prototype.html')
    args = parser.parse_args()
    assets = ROOT / 'assets'
    assets.mkdir(exist_ok=True)
    meta = {'source': args.url, 'component': 'src/pages/auction/AuctionPage.tsx',
            'viewport': [390, 820], 'deviceScaleFactor': 2, 'screens': {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--force-color-profile=srgb', '--hide-scrollbars'])
        page = browser.new_page(viewport={'width': 390, 'height': 820}, device_scale_factor=2,
                                locale='ru-RU', timezone_id='Asia/Novosibirsk', reduced_motion='reduce')
        page.clock.install(time=datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc))
        page.goto(args.url, wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.clock.pause_at(datetime(2026, 11, 23, 12, 1, tzinfo=timezone.utc))
        page.get_by_text('Режим практики', exact=True).click()
        page.get_by_role('button', name='Готовый пример со ставками').click()
        page.get_by_role('button', name='Открыть пример', exact=True).click()
        page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
        card = page.get_by_label('Участие в аукционе').locator('section').first
        meta['cardTop'] = card.bounding_box()['y']

        def capture(name, controls=None, full=True):
            if full:
                page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
            page.screenshot(path=str(assets / f'{name}.png'), full_page=full,
                            animations='disabled', caret='hide')
            targets = {key: {k: round(v, 3) for k, v in loc.bounding_box().items()}
                       for key, loc in (controls or {}).items()}
            meta['screens'][name] = {'height': page.evaluate('document.documentElement.scrollHeight') if full else 820,
                                     'scrollY': page.evaluate('window.scrollY'), 'controls': targets}

        plus = page.get_by_role('button', name='Увеличить ставку на один шаг')
        bid = page.get_by_role('button', name='Сделать ставку', exact=True)
        capture('conditions', {'plus': plus, 'bid': bid})
        plus.click()
        assert page.locator('#bid-amount').input_value().replace('\xa0', ' ') == '14 350 000'
        capture('conditions-focused', {'plus': plus, 'bid': bid})
        page.evaluate("y => window.scrollTo({top:y,behavior:'instant'})", meta['cardTop'] - 18)
        bid.click()
        page.get_by_role('dialog', name='Подтвердите ставку').wait_for()
        confirm = page.get_by_role('button', name='Подтвердить ставку', exact=True)
        meta['modalBackgroundScroll'] = page.evaluate('window.scrollY')
        capture('review', {'confirm': confirm}, full=False)
        confirm.click()
        page.get_by_text('Отправляем вашу ставку', exact=True).wait_for()
        capture('pending')
        page.clock.run_for(1600)
        page.get_by_text('Ваша ставка лидирует', exact=True).wait_for()
        capture('published')
        browser.close()
    data = json.dumps(meta, ensure_ascii=False, indent=2)
    (assets / 'screens.json').write_text(data + '\n')
    (ROOT / 'screens.js').write_text('window.SCREENS = ' + data + ';\n')
    print(data)


if __name__ == '__main__':
    main()
