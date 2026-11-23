"""Capture the actual seller prototype; no recreated interface components."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5183/auction/app')
    args = parser.parse_args()
    assets = ROOT / 'assets'
    assets.mkdir(exist_ok=True)
    meta = {'source': args.url, 'viewport': [390, 820], 'deviceScaleFactor': 2, 'screens': {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--force-color-profile=srgb', '--hide-scrollbars'])
        context = browser.new_context(viewport={'width': 390, 'height': 820},
                                      device_scale_factor=2, locale='ru-RU',
                                      timezone_id='Asia/Novosibirsk', reduced_motion='reduce')
        page = context.new_page()
        page.clock.install(time=datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc))
        page.goto(args.url, wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.get_by_role('heading', name='Ваша квартира. Ваши условия.').wait_for()
        page.clock.pause_at(datetime(2026, 11, 23, 12, 1, tzinfo=timezone.utc))

        def capture(name, controls=None):
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=str(assets / f'{name}.png'), full_page=True,
                            animations='disabled', caret='hide')
            targets = {}
            for key, locator in (controls or {}).items():
                box = locator.bounding_box()
                targets[key] = {k: round(v, 3) for k, v in box.items()}
            meta['screens'][name] = {
                'height': page.evaluate('document.documentElement.scrollHeight'),
                'controls': targets,
            }

        price = page.get_by_role('textbox', name='Стартовая цена, ₽')
        check = page.get_by_role('button', name='Проверить условия')
        capture('conditions', {'price': price, 'review': check})
        price.focus()
        capture('conditions-focused', {'price': price, 'review': check})
        check.click()
        checkbox = page.get_by_role('checkbox', name='Подтверждаю условия аукциона')
        publish = page.get_by_role('button', name='Опубликовать аукцион', exact=True)
        capture('review', {'agree': checkbox, 'publish': publish})
        checkbox.check()
        capture('review-agreed', {'agree': checkbox, 'publish': publish})
        publish.click()
        page.get_by_role('button', name='Публикуем аукцион…').wait_for()
        capture('pending')
        page.clock.run_for(1200)
        page.get_by_role('heading', name='Аукцион запущен', exact=True).wait_for()
        capture('published')
        browser.close()
    (assets / 'screens.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
