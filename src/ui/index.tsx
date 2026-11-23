import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type CSSProperties,
} from 'react';
import clsx from 'clsx';
import classes from './classes.json';
import icons from './icons.json';
import s from './ui.module.css';

const classMap = classes as Record<string, Record<string, string>>;
export function kitClass(path: string, ...names: (string | false | undefined)[]) {
  return names
    .filter(Boolean)
    .map((name) => classMap[`@cian/ui-kit/${path}`]?.[name as string] || '')
    .join(' ');
}

const extraIcons: Record<string, string> = {
  Heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  Menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  Sort: '<path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4"/>',
  Message:
    '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  Bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
};
export type IconName = (typeof icons)[number]['name'] | keyof typeof extraIcons;
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const svg =
    icons.find((icon) => icon.name === name)?.svg ||
    (extraIcons[name]
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${extraIcons[name]}</svg>`
      : '');
  return (
    <span
      aria-hidden="true"
      className={clsx(s.icon, className)}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export const buttonThemes = [
  'main_primary',
  'main_secondary',
  'stroke_primary',
  'stroke_secondary',
  'positive_primary',
  'positive_secondary',
  'negative_primary',
  'negative_secondary',
  'warning_primary',
  'warning_secondary',
  'inverted',
] as const;
export type ButtonTheme = (typeof buttonThemes)[number];
export type ControlSize = 'XS' | 'M' | 'L';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  theme?: ButtonTheme;
  size?: ControlSize;
  loading?: boolean;
  fullWidth?: boolean;
  beforeIcon?: IconName;
}
export function Button({
  theme = 'main_primary',
  size = 'M',
  loading,
  fullWidth,
  beforeIcon,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const shared = 'button/styles/shared.module.css';
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        kitClass(
          shared,
          'button',
          size,
          fullWidth && 'full-width',
          !!beforeIcon && 'button--before-icon',
        ),
        kitClass('button/styles/button.module.css', 'button'),
        kitClass(`button/themes/Button/${theme}.module.css`, 'button'),
        s.button,
        className,
      )}
    >
      {loading ? <Spinner size={18} /> : beforeIcon ? <Icon name={beforeIcon} size={18} /> : null}
      <span className={kitClass(shared, 'text')}>
        <span className={kitClass(shared, 'title')}>{children}</span>
      </span>
    </button>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  size?: ControlSize;
  leadingIcon?: IconName;
}
export function Input({
  label,
  hint,
  error,
  size = 'M',
  leadingIcon,
  id,
  className,
  disabled,
  ...props
}: InputProps) {
  const uid = useId();
  const inputId = id || uid;
  const wrapper = 'internal/components/InputWrapper/styles/styles.module.css';
  const sizing = `internal/components/InputWrapper/styles/size/${size}.module.css`;
  const description =
    [props['aria-describedby'], (error || hint) && `${inputId}-message`]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={clsx(s.field, className)}>
      <label className={s.fieldLabel} htmlFor={inputId}>
        {label}
      </label>
      <div
        className={clsx(
          kitClass(wrapper, 'input-wrapper', !!error && 'invalid', disabled && 'disabled'),
          kitClass(sizing, 'input-wrapper'),
          s.fieldControl,
        )}
      >
        {leadingIcon && <Icon name={leadingIcon} />}
        <div
          className={clsx(
            kitClass(wrapper, 'children-wrapper'),
            kitClass(sizing, 'children-wrapper'),
            s.inputChildren,
          )}
        >
          <input
            {...props}
            disabled={disabled}
            id={inputId}
            data-autofocus={props.autoFocus || undefined}
            aria-invalid={error ? true : props['aria-invalid']}
            aria-describedby={description}
            className={kitClass('internal/components/InputWrapperInput/styles.module.css', 'input')}
          />
        </div>
      </div>
      {(error || hint) && (
        <span id={`${inputId}-message`} className={clsx(s.hint, error && s.error)}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly { value: string; label: string }[];
}
export function Select({ label, options, id, className, ...props }: SelectProps) {
  const uid = useId();
  const selectId = id || uid;
  return (
    <div className={clsx(s.field, className)}>
      <label className={s.fieldLabel} htmlFor={selectId}>
        {label}
      </label>
      <select {...props} id={selectId} className={s.select}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  label: string;
}
export function Checkbox({
  label,
  className,
  checked,
  defaultChecked,
  onChange,
  ...props
}: CheckboxProps) {
  const [internal, setInternal] = useState(defaultChecked ?? false);
  const value = checked ?? internal;
  const path = 'checkbox/components/CheckToggle/styles.module.css';
  return (
    <label className={clsx(s.checkLabel, className)}>
      <input
        {...props}
        type="checkbox"
        checked={value}
        onChange={(event) => {
          setInternal(event.currentTarget.checked);
          onChange?.(event);
        }}
      />
      <span
        aria-hidden="true"
        className={kitClass(path, 'root', value && 'checked', props.disabled && 'disabled')}
      >
        <span className={kitClass(path, 'box')}>
          <Icon name="FunctionalSuccess16" size={16} />
        </span>
      </span>
      <span>{label}</span>
    </label>
  );
}
export function Radio({ label, className, ...props }: CheckboxProps) {
  const control = 'internal/components/ControlButton/styles/styles.module.css';
  return (
    <label className={clsx(kitClass(control, 'control-button'), s.radio, className)}>
      <input {...props} type="radio" />
      <span
        className={clsx(
          kitClass(control, 'button'),
          kitClass('internal/components/ControlButton/styles/size/M.module.css', 'button'),
        )}
      >
        {label}
      </span>
    </label>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'main' | 'positive' | 'warning' | 'negative';
}) {
  const path = 'label/components/Label/styles.module.css';
  return (
    <span
      className={kitClass(path, 'label')}
      style={{
        background: `var(--surface-${tone}-default)`,
        color: `var(--text-${tone === 'neutral' ? 'secondary' : tone}-default)`,
      }}
    >
      <span className={kitClass(path, 'text')}>{children}</span>
    </span>
  );
}
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={s.spinner}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Загрузка"
    />
  );
}
export function Skeleton({
  width = '100%',
  height = 16,
}: {
  width?: CSSProperties['width'];
  height?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        kitClass('skeleton/components/Skeleton/styles.module.css', 'skeleton'),
        s.skeleton,
      )}
      style={{ width, height }}
    />
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  preview = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Static, non-focusing rendering for isolated scenario-map thumbnails. */
  preview?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (preview) return;
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus="true"], [autofocus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      active?.focus();
    };
  }, [open, preview]);
  if (preview)
    return open ? (
      <div className={s.modalPreview}>
        <div className={s.modal} role="dialog" aria-labelledby={titleId}>
          <div className={s.modalHeader}>
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть окно"
              className={s.iconButton}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    ) : null;
  return (
    <dialog
      ref={ref}
      className={s.modal}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={s.modalHeader}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Закрыть окно" className={s.iconButton}>
          <Icon name="ActionClose16" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Tooltip({ text, label = 'Подробнее' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={s.tooltipWrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={s.iconButton}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Icon name="FunctionalInformationCircle16" />
      </button>
      {open && (
        <span role="tooltip" id={id} className={s.tooltip}>
          {text}
        </span>
      )}
    </span>
  );
}

export type TextVariant =
  | 'UIHeading1'
  | 'UIHeading2'
  | 'UIHeading3'
  | 'UIHeading4'
  | 'UIHeading5'
  | 'UIHeading6'
  | 'Body1'
  | 'Body2'
  | 'Caption';
export function Text({
  as: Tag = 'p',
  variant = 'Body1',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  variant?: TextVariant;
}) {
  return <Tag {...props} className={clsx(s[variant], className)} />;
}
