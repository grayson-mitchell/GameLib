import { useTranslation } from 'react-i18next'
import { InfoBox } from 'frontend/components/UI'
import {
  ColumnProps,
  TableInput
} from 'frontend/components/UI/TwoColTableInput'
import useUiState from 'frontend/state/uiState'
import { WrapperVariable } from 'common/types'
import useSetting from 'frontend/hooks/useSetting'

const WrappersTable = () => {
  const { t } = useTranslation()
  const platform = useUiState((s) => s.platform)
  const isWindow = platform === 'win32'

  const [wrapperOptions, setWrapperOptions] = useSetting('wrapperOptions', [])

  if (isWindow) {
    return <></>
  }

  const getWrapperVariables = () => {
    const columns: ColumnProps[] = []
    wrapperOptions.forEach((opt) =>
      columns.push({ key: opt.exe, value: opt.args })
    )
    return columns
  }

  const onWrappersChange = (cols: ColumnProps[]) => {
    const wrappers: WrapperVariable[] = []
    cols.forEach((col) =>
      wrappers.push({ exe: col.key.trim(), args: col.value.trim() })
    )
    setWrapperOptions(wrappers)
  }

  const wrapperInfo = (
    <InfoBox text="infobox.help" iconOnly>
      {t(
        'options.wrapper.arguments_example',
        'Arguments example: --arg; --extra-file="file-path/ with/spaces"'
      )}
    </InfoBox>
  )

  return (
    <TableInput
      label={t('options.wrapper.title', 'Wrapper command:')}
      htmlId={'wrapperOptions'}
      header={{
        key: t('options.wrapper.exe', 'Wrapper'),
        value: t('options.wrapper.args', 'Arguments')
      }}
      rows={getWrapperVariables()}
      fullFills={{ key: true, value: false }}
      onChange={onWrappersChange}
      inputPlaceHolder={{
        key: t('options.wrapper.placeHolderKey', 'New Wrapper'),
        value: t('options.wrapper.placeHolderValue', 'Wrapper Arguments')
      }}
      warning={
        <span className="settingsWarning">
          {`${t(
            'options.quote-args-with-spaces',
            'Warning: Make sure to quote args with spaces! E.g.: "path/with spaces/"'
          )}`}
        </span>
      }
      labelHelp={wrapperInfo}
    />
  )
}

export default WrappersTable
