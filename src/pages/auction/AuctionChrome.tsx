import { Button as KitButton, Modal, type ButtonProps } from '@/ui';
import { AuctionIcon } from './AuctionIcon';
import s from './AuctionChrome.module.css';

export function AuctionHeader({
  onHelp,
  preview = false,
}: {
  onHelp: () => void;
  preview?: boolean;
}) {
  return (
    <header className={`${s.header} ${preview ? s.previewHeader : ''}`}>
      <div className={s.headerInner}>
        <img className={s.logo} src="/images/cian-logo.svg" alt="Циан" width="112" height="28" />
        <span className={s.section}>Аукцион квартиры</span>
        <nav className={s.menu} aria-label="Меню аукциона">
          <button type="button" className={s.helpButton} onClick={onHelp}>
            <AuctionIcon name="info" size={18} />
            Как это работает
          </button>
        </nav>
        <span className={s.avatar} aria-label="Профиль Татьяны">
          Т
        </span>
      </div>
    </header>
  );
}

export function AuctionFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <img
          className={s.footerLogo}
          src="/images/cian-logo.svg"
          alt="Циан"
          width="80"
          height="20"
        />
        <span>Недвижимость. С новой возможностью.</span>
      </div>
    </footer>
  );
}

export function AuctionButton({ className = '', size = 'L', ...props }: ButtonProps) {
  return (
    <KitButton
      {...props}
      size={size}
      data-auction-size={size}
      className={`${s.button} ${className}`}
    />
  );
}

export function AuctionHelp({
  open,
  onClose,
  preview = false,
}: {
  open: boolean;
  onClose: () => void;
  preview?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} preview={preview} title="Как работает аукцион">
      <div className={s.helpContent}>
        <p>Выберите роль в переключателе вверху экрана.</p>
        <h3>Я продавец</h3>
        <ol>
          <li>Укажите стартовую цену, минимальный шаг ставки и длительность.</li>
          <li>Проверьте условия. До публикации можно вернуться к редактированию.</li>
          <li>Подтвердите условия и запустите аукцион.</li>
        </ol>
        <h3>Я покупатель</h3>
        <ol>
          <li>Изучите квартиру и условия аукциона.</li>
          <li>Предложите сумму не ниже минимальной и подтвердите ставку.</li>
          <li>Дождитесь подтверждения и следите за статусом ставки.</li>
        </ol>
        <p>
          Побеждает самая высокая принятая ставка к моменту окончания аукциона. Оплата и оформление
          сделки в этом сценарии не предусмотрены.
        </p>
        <AuctionButton fullWidth onClick={onClose}>
          Понятно
        </AuctionButton>
      </div>
    </Modal>
  );
}
