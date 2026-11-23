import { AuctionIcon } from './AuctionIcon';
import type { AuctionRole } from './roleNavigation';
import s from './RoleSwitcher.module.css';

export function RoleSwitcher({
  role,
  onChange,
  disabled = false,
  preview = false,
}: {
  role: AuctionRole;
  onChange: (role: AuctionRole) => void;
  disabled?: boolean;
  preview?: boolean;
}) {
  return (
    <div className={`${s.bar} ${preview ? s.preview : ''}`}>
      <div className={s.control} role="group" aria-label="Переключить роль">
        {(['buyer', 'seller'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={role === value}
            disabled={disabled}
            onClick={() => {
              if (value !== role) onChange(value);
            }}
          >
            <AuctionIcon name={value === 'buyer' ? 'search' : 'home'} size={18} />
            {value === 'buyer' ? 'Я покупатель' : 'Я продавец'}
          </button>
        ))}
      </div>
    </div>
  );
}
