import React from 'react'

import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'

import GameLibIcon from 'frontend/assets/gamelib-icon.png'

import type { SystemInformation } from 'backend/utils/systeminfo'
import { useTranslation } from 'react-i18next'

interface Props {
  software: SystemInformation['softwareInUse']
}

function SoftwareInfo({ software }: Props) {
  const { t } = useTranslation()

  const {
    heroicVersion,
    legendaryVersion,
    gogdlVersion,
    cometVersion,
    nileVersion
  } = software

  return (
    <Paper sx={{ padding: 1 }} square>
      <Typography variant="h6">
        {t('settings.systemInformation.software', 'Software:')}
      </Typography>
      <Grid container>
        <Grid item xs={2}>
          <img
            src={GameLibIcon}
            className="heroic-icon"
            alt="GameLib"
            style={{ width: 40, height: 40, objectFit: 'contain' }}
          />
        </Grid>
        <Grid item xs={10}>
          {t(
            'settings.systemInformation.heroicVersion',
            'GameLib: {{heroicVersion}}',
            {
              heroicVersion
            }
          )}
          <br />
          {t(
            'settings.systemInformation.legendaryVersion',
            'Legendary: {{legendaryVersion}}',
            { legendaryVersion }
          )}
          <br />
          {t(
            'settings.systemInformation.gogdlVersion',
            'Gogdl: {{gogdlVersion}}',
            {
              gogdlVersion
            }
          )}
          <br />
          {t(
            'settings.systemInformation.cometVersion',
            'Comet: {{cometVersion}}',
            {
              cometVersion
            }
          )}
          <br />
          {t(
            'settings.systemInformation.nileVersion',
            'Nile: {{nileVersion}}',
            {
              nileVersion
            }
          )}
        </Grid>
      </Grid>
    </Paper>
  )
}

export default React.memo(SoftwareInfo)
