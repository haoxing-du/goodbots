import { radioGroupKeys, radioTabIndex } from "../lib/radioGroup";
import s from "./Pills.module.css";

export function Pills<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const values = options.map((o) => o.value);
  return (
    <div
      className={s.pills}
      role="radiogroup"
      aria-label={label}
      onKeyDown={radioGroupKeys(values, onChange)}
    >
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={radioTabIndex(values, value, i)}
          className={o.value === value ? s.on : s.off}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
