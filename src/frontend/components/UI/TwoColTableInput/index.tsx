import { Fragment, KeyboardEvent, ReactNode, useEffect, useState } from 'react'
import SvgButton from '../SvgButton'
import TextInputField from '../TextInputField'
import AddBoxIcon from '@mui/icons-material/AddBox'
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import classnames from 'classnames'
import useSettingsState, { selectIsRTL } from 'frontend/state/settingsState'
import FieldLabel from '../FieldLabel'
import './index.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTranslation } from 'react-i18next'

export interface ColumnProps {
  key: string
  value: string
}

interface FullFillProps {
  key: boolean
  value: boolean
}

interface Props {
  label: string
  labelHelp?: ReactNode
  htmlId: string
  header: ColumnProps
  rows: ColumnProps[]
  fullFills?: FullFillProps
  onChange: (values: ColumnProps[]) => void
  inputPlaceHolder?: ColumnProps
  warning?: ReactNode
  afterInput?: ReactNode
  validation?: (key: string, value: string) => [string, string]
  connector?: string
}

const EMPTY_INPUTS = { key: '', value: '' }

export function TableInput({
  label,
  labelHelp,
  htmlId,
  header,
  rows,
  fullFills = { key: true, value: true },
  onChange,
  inputPlaceHolder = EMPTY_INPUTS,
  warning,
  afterInput,
  validation,
  connector = ''
}: Props) {
  const isRTL = useSettingsState(selectIsRTL)
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const [rowData, setRowData] = useState<ColumnProps[]>(rows)
  const [newVarName, setNewVarName] = useState('')
  const [newVarValue, setNewVarValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [keyError, setKeyError] = useState('')
  const [valueError, setValueError] = useState('')

  useEffect(() => {
    if (
      // if there's a connector, try to split the key
      connector &&
      newVarName.includes(connector) &&
      !newVarValue
    ) {
      const [key = '', value = ''] = newVarName.split(connector)
      setNewVarName(key)
      setNewVarValue(value)
    } else {
      // else, validate input
      if (validation) {
        const [keyError, valueError] = validation(newVarName, newVarValue)
        setKeyError(keyError)
        setValueError(valueError)
      }
    }
  }, [newVarName, newVarValue])

  function addRow(row: ColumnProps) {
    if (keyError) {
      return
    }

    if (!row) {
      return
    } else if (
      (!row.key && fullFills?.key) ||
      (!row.value && fullFills?.value)
    ) {
      return
    }

    // update already added envs
    const existing = rowData.find((entry: ColumnProps) => entry.key === row.key)
    if (existing) {
      existing.value = row.value
    } else {
      rowData.push(row)
    }
    setRowData([...rowData])
    onChange(rowData)
    setNewVarName('')
    setNewVarValue('')
  }

  function removeRow(row: ColumnProps) {
    const index = rowData.findIndex((entry) => entry === row)
    rowData.splice(index, 1)
    clearEdit()
    setRowData([...rowData])
    onChange(rowData)
  }

  function clearEdit() {
    setEditingIndex(null)
    setEditKey('')
    setEditValue('')
  }

  function editRow(index: number) {
    const row = rowData[index]
    if (!row) {
      return
    }
    setEditingIndex(index)
    setEditKey(row.key)
    setEditValue(row.value)
  }

  const [editKeyError, editValueError]: [string, string] =
    editingIndex !== null && validation
      ? validation(editKey, editValue)
      : ['', '']

  function saveEdit() {
    if (
      editingIndex === null ||
      editKeyError ||
      editValueError ||
      (!editKey && fullFills.key) ||
      (!editValue && fullFills.value)
    ) {
      return
    }
    const next = rowData
      .map((entry, i) =>
        i === editingIndex ? { key: editKey, value: editValue } : entry
      )
      .filter((entry, i) => i === editingIndex || entry.key !== editKey)
    setRowData(next)
    onChange(next)
    clearEdit()
  }

  function onEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      saveEdit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      clearEdit()
    }
  }

  function onEditKeyChange(newValue: string) {
    if (connector && newValue.includes(connector) && !editValue) {
      const [key = '', value = ''] = newValue.split(connector)
      setEditKey(key)
      setEditValue(value)
    } else {
      setEditKey(newValue)
    }
  }

  const dirtyInputs = !!(newVarName || newVarValue)

  return (
    <div
      className={classnames(`tableFieldWrapper Field`, {
        isRTL
      })}
    >
      {label && <FieldLabel htmlId={htmlId} label={label} help={labelHelp} />}
      <table>
        <tbody>
          <tr>
            <th>{header.key}</th>
            <th>{header.value}</th>
            <th></th>
          </tr>
          {!!rowData.length &&
            rowData.map((row: ColumnProps, index) => {
              if (index === editingIndex) {
                return (
                  <Fragment key={index}>
                    <tr>
                      <td>
                        <TextInputField
                          label={header.key}
                          value={editKey}
                          htmlId={`${htmlId}-edit-key`}
                          placeholder={inputPlaceHolder.key}
                          extraClass={editKeyError ? 'error' : ''}
                          autoFocus
                          onKeyDown={onEditKeyDown}
                          onChange={onEditKeyChange}
                        />
                      </td>
                      <td>{connector}</td>
                      <td>
                        <TextInputField
                          label={header.value}
                          value={editValue}
                          htmlId={`${htmlId}-edit-value`}
                          placeholder={inputPlaceHolder.value}
                          onKeyDown={onEditKeyDown}
                          onChange={(newValue) => setEditValue(newValue)}
                        />
                      </td>
                      <td>
                        <SvgButton
                          onClick={() => saveEdit()}
                          title={tGamelib('gamelib:twoColTable.save', 'Save')}
                          aria-label={tGamelib(
                            'gamelib:twoColTable.save',
                            'Save'
                          )}
                        >
                          <CheckIcon
                            style={{ color: 'var(--success)' }}
                            fontSize="large"
                          />
                        </SvgButton>
                        <SvgButton
                          onClick={() => clearEdit()}
                          title={tGamelib(
                            'gamelib:twoColTable.cancel',
                            'Cancel'
                          )}
                          aria-label={tGamelib(
                            'gamelib:twoColTable.cancel',
                            'Cancel'
                          )}
                        >
                          <CloseIcon
                            style={{ color: 'var(--danger)' }}
                            fontSize="large"
                          />
                        </SvgButton>
                      </td>
                    </tr>
                    {(editKeyError || editValueError) && (
                      <tr className="error">
                        <td colSpan={3}>{editKeyError || editValueError}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              }
              return (
                <tr key={index}>
                  <td>
                    <span>{row.key}</span>
                  </td>
                  <td></td>
                  <td>
                    <span>{row.value}</span>
                  </td>
                  <td>
                    <SvgButton
                      onClick={() => editRow(index)}
                      title={tGamelib('gamelib:twoColTable.edit', 'Edit')}
                      aria-label={tGamelib('gamelib:twoColTable.edit', 'Edit')}
                    >
                      <EditIcon
                        style={{ color: 'var(--accent)' }}
                        fontSize="large"
                      />
                    </SvgButton>
                    <SvgButton
                      onClick={() => removeRow(row)}
                      title={tGamelib('gamelib:twoColTable.remove', 'Remove')}
                      aria-label={tGamelib(
                        'gamelib:twoColTable.remove',
                        'Remove'
                      )}
                    >
                      <RemoveCircleIcon
                        style={{ color: 'var(--danger)' }}
                        fontSize="large"
                      />
                    </SvgButton>
                  </td>
                </tr>
              )
            })}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <TextInputField
                label={header.key}
                value={newVarName}
                htmlId={`${header.key}-key`}
                placeholder={inputPlaceHolder.key}
                extraClass={keyError ? 'error' : ''}
                onChange={(newValue) => setNewVarName(newValue)}
              />
            </td>
            <td>{connector}</td>
            <td>
              <TextInputField
                label={header.value}
                value={newVarValue}
                htmlId={`${header.value}-key`}
                placeholder={inputPlaceHolder.value}
                onChange={(newValue) => setNewVarValue(newValue)}
              />
            </td>
            <td>
              <SvgButton
                onClick={() => addRow({ key: newVarName, value: newVarValue })}
                className={`is-primary`}
              >
                <AddBoxIcon
                  style={{ color: 'var(--success)' }}
                  fontSize="large"
                />
              </SvgButton>
            </td>
          </tr>
          <tr className="error">
            <td colSpan={3}>{keyError || valueError}</td>
          </tr>
          <tr className="dirty">
            <td colSpan={3}>
              {dirtyInputs && !keyError && !valueError && newVarName && (
                <>
                  <span>
                    {t(
                      'two_col_table.save_hint',
                      'Changes in this table are not saved automatically. Click the + button'
                    )}
                  </span>
                  <FontAwesomeIcon icon={faArrowUp} />
                </>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
      {(newVarValue || (editingIndex !== null && editValue)) && warning}
      {afterInput}
    </div>
  )
}
