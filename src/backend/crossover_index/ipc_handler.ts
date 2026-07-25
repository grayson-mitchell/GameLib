import { addHandler } from 'backend/ipc'

import { buildCrossoverRatingMap } from './crossoverRatingMap'

addHandler('getCrossoverIndex', async () => buildCrossoverRatingMap())
