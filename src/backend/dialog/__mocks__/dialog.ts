import { propsOnly } from '../../testUtils/propsOnlyMock'

const dialog = jest.requireActual('../dialog')

dialog.showDialogBoxModalAuto = propsOnly(jest.fn())
dialog.notify = propsOnly(jest.fn())

module.exports = dialog
