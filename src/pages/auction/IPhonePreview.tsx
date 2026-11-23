import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AuctionIcon } from './AuctionIcon';
import s from './IPhonePreview.module.css';

export function IPhonePreview() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    document.title = 'Аукцион в мобильном приложении · Циан';
    function fitPhone() {
      setScale(
        Math.min(1, (window.innerWidth - 40) / 414, Math.max(620, window.innerHeight - 172) / 880),
      );
    }
    fitPhone();
    window.addEventListener('resize', fitPhone);
    return () => window.removeEventListener('resize', fitPhone);
  }, []);

  return (
    <main className={s.studio}>
      <header className={s.studioHeader}>
        <div className={s.brand}>
          <img className={s.logo} src="/images/cian-logo.svg" alt="Циан" width="112" height="28" />
          <span className={s.divider} />
          <div>
            <h1>Аукцион квартиры</h1>
            <span>Мобильный прототип</span>
          </div>
        </div>
        <Link to="/auction/app" className={s.fullscreen}>
          Открыть без рамки <AuctionIcon name="arrow" size={16} />
        </Link>
      </header>

      <div className={s.presentation}>
        <div className={s.deviceSlot} style={{ '--phone-scale': scale } as CSSProperties}>
          <div className={s.device}>
            <span className={s.silentSwitch} aria-hidden="true" />
            <span className={s.volumeUp} aria-hidden="true" />
            <span className={s.volumeDown} aria-hidden="true" />
            <span className={s.powerButton} aria-hidden="true" />
            <div className={s.screen}>
              <div className={s.statusBar} aria-hidden="true">
                <span className={s.time}>9:41</span>
                <div className={s.island}>
                  <span />
                </div>
                <div className={s.statusIcons}>
                  <svg width="18" height="13" viewBox="0 0 18 13" fill="currentColor">
                    <rect x="0" y="8" width="3" height="5" rx=".7" />
                    <rect x="5" y="5.5" width="3" height="7.5" rx=".7" />
                    <rect x="10" y="3" width="3" height="10" rx=".7" />
                    <rect x="15" width="3" height="13" rx=".7" />
                  </svg>
                  <svg
                    width="17"
                    height="14"
                    viewBox="0 0 20 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M2 5a12 12 0 0 1 16 0M5 8.5a7.5 7.5 0 0 1 10 0M8 12a3 3 0 0 1 4 0" />
                    <circle cx="10" cy="14.5" r=".6" fill="currentColor" stroke="none" />
                  </svg>
                  <svg width="26" height="13" viewBox="0 0 28 14" fill="none">
                    <rect
                      x=".6"
                      y=".6"
                      width="23"
                      height="12.8"
                      rx="3.5"
                      stroke="currentColor"
                      opacity=".4"
                    />
                    <rect x="2.6" y="2.6" width="19" height="8.8" rx="1.6" fill="currentColor" />
                    <path d="M25 4.5v5a2.7 2.7 0 0 0 0-5Z" fill="currentColor" opacity=".4" />
                  </svg>
                </div>
              </div>
              <iframe
                className={s.appFrame}
                src="/auction/app"
                title="Мобильное приложение Циан — сценарий продавца"
              />
              <div className={s.homeArea} aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
        </div>
        <p className={s.caption}>
          <span />
          iPhone · Сценарий продавца<span className={s.captionDivider}>/</span>Интерактивный
          прототип
        </p>
      </div>
    </main>
  );
}
