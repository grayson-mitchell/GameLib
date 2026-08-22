import SliderField from 'frontend/components/UI/SliderField'
import { updateGamepadActions } from 'frontend/helpers/gamepad'
import useSetting from 'frontend/hooks/useSetting'
import { useTranslation } from 'react-i18next'

const GamePadDelayRepeat = () => {
  const { t: tGamelib } = useTranslation('gamelib')
  const [activationDelay, setActivationDelay] = useSetting(
    'gamepadInitialRepeatDelay',
    300
  )
  const [repeatDelay, setRepeatDelay] = useSetting('gamepadRepeatDelay', 50)

  return (
    <div
      tabIndex={-1}
      style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
    >
      <SliderField
        htmlId="gamePadDelayRepeat"
        value={activationDelay}
        step={10}
        min={50}
        max={500}
        onChange={(value) => {
          setActivationDelay(value)
          void updateGamepadActions()
        }}
        label={tGamelib(
          'gamelib:settings.gamepadInitialRepeatDelay',
          'Gamepad input initial repeat delay'
        )}
        marks={[
          { value: 50, label: '50 ms' },
          { value: 500, label: '500 ms' }
        ]}
      />

      <SliderField
        htmlId="gamePadRepeatRate"
        value={repeatDelay}
        step={5}
        min={5}
        max={150}
        onChange={(value) => {
          setRepeatDelay(value)
          void updateGamepadActions()
        }}
        label={tGamelib(
          'gamelib:settings.gamepadRepeatFrequency',
          'Gamepad input repeat frequency'
        )}
        marks={[
          { value: 5, label: '5 ms' },
          { value: 150, label: '150 ms' }
        ]}
      />
    </div>
  )
}

export default GamePadDelayRepeat
