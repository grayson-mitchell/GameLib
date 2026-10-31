import { ReactNode, useContext } from 'react'
import classnames from 'classnames'
import ContextProvider from 'frontend/state/ContextProvider'
import { Select, MenuItem, SelectChangeEvent } from '@mui/material'
import FieldLabel from '../FieldLabel'
import './index.css'

interface SelectFieldProps {
  htmlId: string
  value: string
  onChange: (event: SelectChangeEvent) => void
  children: ReactNode
  afterSelect?: ReactNode
  label?: string
  labelHelp?: ReactNode
  prompt?: string
  disabled?: boolean
  extraClass?: string
}

export default function SelectField({
  htmlId,
  value,
  onChange,
  label,
  labelHelp,
  prompt,
  disabled = false,
  extraClass = '',
  afterSelect,
  children
}: SelectFieldProps) {
  const { isRTL } = useContext(ContextProvider)

  return (
    <div
      className={classnames(`selectFieldWrapper Field ${extraClass}`, {
        isRTL
      })}
    >
      {label && <FieldLabel htmlId={htmlId} label={label} help={labelHelp} />}
      <Select
        id={htmlId}
        value={value}
        tabIndex={-1}
        onChange={onChange}
        disabled={disabled}
        sx={{
          '& .MuiSelect-icon': { display: 'none' },
          '& .MuiOutlinedInput-notchedOutline legend': { width: 0 },
          '& .MuiSelect-select': {
            textAlign: isRTL ? 'right' : 'left'
          }
        }}
      >
        {prompt && <MenuItem value="">{prompt}</MenuItem>}
        {children}
      </Select>
      {afterSelect}
    </div>
  )
}
