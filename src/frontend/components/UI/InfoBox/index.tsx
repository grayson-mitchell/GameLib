import './index.css'

import { useTranslation } from 'react-i18next'
import Info from '@mui/icons-material/Info'
import React from 'react'
import PopoverComponent from '../PopoverComponent'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

interface Props {
  children: React.ReactElement | React.ReactNode | React.ReactNode[]
  text: string
  iconOnly?: boolean
}

export default function InfoBox({ children, text, iconOnly = false }: Props) {
  const { t } = useTranslation()

  /*
    keys to parse
      t('infobox.help', 'Help')
      t('infobox.requirements')
      t('infobox.warning', 'Warning')
    */

  return (
    <PopoverComponent
      item={
        iconOnly ? (
          <button
            type="button"
            className="helpLink helpLink--iconOnly"
            aria-label={t(text)}
            title={t(text)}
          >
            {/* Same glyph as the checkbox-row InfoIcon, so help reads alike everywhere */}
            <FontAwesomeIcon icon={faCircleInfo} />
          </button>
        ) : (
          <span className="helpLink">
            <Info />
            <span>{t(text)}</span>
          </span>
        )
      }
    >
      <div className="poppedElement">{children}</div>
    </PopoverComponent>
  )
}
