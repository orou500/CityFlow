import { formatMoneyExact, formatMoney } from '../utils/format';

export default function CompactValue({ value, className = '' }) {
  const compact = formatMoney(value);
  const exact = formatMoneyExact(value);
  return (
    <span className={`relative group inline-block ${className}`}>
      {compact}
      {compact !== exact && (
        <span className="absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
          {exact}
        </span>
      )}
    </span>
  );
}
