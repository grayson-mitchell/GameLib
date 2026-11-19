import { MenuItem, Select } from '@mui/material'

import './index.css'

interface RegionPickerOption {
  countryCode: string
  label: string
  /** Shown as a pill and in the selected value; omitted for Store Search. */
  currencyCode?: string
}

interface RegionPickerProps {
  id: string
  label: string
  /** The chosen country, or null for Auto. */
  value: string | null
  /** Text of the Auto entry (names the country Auto resolves to). */
  autoLabel: string
  options: readonly RegionPickerOption[]
  onChange: (countryCode: string | null) => void
  /** BCP-47 tag used to sort the option labels. */
  locale: string
  className?: string
}

/**
 * Shared price-region picker (G-47-8): used by Store Search and the Deals
 * screen. Hookless on purpose: every string arrives as a prop, so the
 * component carries no i18n or state dependency.
 */
export default function RegionPicker({
  id,
  label,
  value,
  autoLabel,
  options,
  onChange,
  locale,
  className
}: RegionPickerProps) {
  const sorted = [...options].sort((a, b) =>
    a.label.localeCompare(b.label, locale)
  )

  return (
    <div className={className ? `regionPicker ${className}` : 'regionPicker'}>
      <label className="regionPicker__label" htmlFor={id}>
        {label}
      </label>
      <Select
        id={id}
        size="small"
        value={value ?? ''}
        onChange={(e) => {
          const next = e.target.value
          onChange(next === '' ? null : next)
        }}
        className="regionPicker__select"
        // Auto is the empty value, and MUI only calls renderValue for an
        // empty value when displayEmpty is set, so without it the closed
        // select rendered blank for Auto on both screens (G-47-14a).
        displayEmpty
        renderValue={(selected) => {
          if (!selected) return autoLabel
          const match = options.find((o) => o.countryCode === selected)
          if (!match) return selected
          return match.currencyCode
            ? `${match.label} · ${match.currencyCode}`
            : match.label
        }}
      >
        <MenuItem value="">{autoLabel}</MenuItem>
        {sorted.map((o) => (
          <MenuItem key={o.countryCode} value={o.countryCode}>
            {o.label}
            {o.currencyCode && (
              <span className="regionPicker__currency">{o.currencyCode}</span>
            )}
          </MenuItem>
        ))}
      </Select>
    </div>
  )
}
