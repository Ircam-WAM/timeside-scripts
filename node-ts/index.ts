import portableFetch from 'portable-fetch'
import {
  TimesideApi,
  Configuration,
  AutoRefreshConfiguration,
  InMemoryJWTToken,
  JWTToken,
  Selection,
  Experience,
  TaskStatusEnum,
  ResultStatusEnum
} from '@ircam/timeside-sdk'
import { config as dotenv } from 'dotenv'
import formDataNode from 'formdata-node'

import { promises as fsPromises } from 'fs'

// Polyfill FormData because SDK use `new FormData`
// @ts-ignore
global.FormData = formDataNode

// Load environment variables from .env file
dotenv()

// Hardcoded uuid / hyperlinks
const PRESETS = {
  aubioPitch: '/timeside/api/presets/842d911f-7dc2-4922-b861-fa8a3e076f72/',
  spectrogram: '/timeside/api/presets/3a5ea98d-ac74-4658-b649-ac7d0ef6f052/',
  meanDcPitch: '/timeside/api/presets/fe7a0c2c-57a8-4bf2-884c-b7a30f22a8dc/'
}

// Deezer preview Provider
const PROVIDER_URL = '/timeside/api/providers/32dd516a-5759-43fd-bc95-3d08eebee196/'

export const basePath = 'https://sandbox.wasabi.telemeta.org'

const API_USER = process.env.TIMESIDE_API_USER
if (!API_USER) {
  throw new Error('Empty environment variable: TIMESIDE_API_USER')
}
const API_PASS = process.env.TIMESIDE_API_PASS
if (!API_PASS) {
  throw new Error('Empty environment variable: TIMESIDE_API_PASS')
}

// This helper saves the JWTToken to window.localStorage
// You may also implements your own way of storing your Token
// by implementing the PersistentJWTToken interface
export const persistentToken = new InMemoryJWTToken()
persistentToken.init()

const urlConfig = {
  basePath,
  // Use alternative fetch API (for Node / Polyfill)
  fetchApi: portableFetch,
}

export const rawApi = new TimesideApi(new Configuration(urlConfig))

// Configuration to auto-refresh token when needed
const apiConfig = AutoRefreshConfiguration(urlConfig, persistentToken)
const api = new TimesideApi(new Configuration(apiConfig))

async function login () {
  const tokenObtainPair = { username: API_USER, password: API_PASS }
  const token = await rawApi.createTokenObtainPair({ tokenObtainPair })
  persistentToken.token = JWTToken.fromBase64(token.access, token.refresh)
}

async function getOrCreateWasabiSelection (): Promise<Selection> {
  const wasabiTitle = 'WASABI'
  const selections = await api.listSelections()
  const existing = selections.find((s) => s.title === wasabiTitle)
  if (existing) {
    return existing
  }
  let newSelection
  try {
    newSelection = await api.createSelection({ selection: { title: wasabiTitle } })
  } catch (e) {
    const resp = await e.json()
    throw new Error(`Unable to create selection: ${JSON.stringify(resp, null, 2)}`)
  }
  return newSelection
}

async function getOrCreateWasabiExperience (): Promise<Experience> {
  const wasabiTitle = 'WASABI_experience'
  const experiences = await api.listExperiences()
  const existing = experiences.find((e) => e.title === wasabiTitle)
  if (existing) {
    return existing
  }

  let newExperience
  try {
    newExperience = await api.createExperience({ experience: { title: wasabiTitle, presets: Object.values(PRESETS) } })
  } catch (e) {
    const resp = await e.json()
    throw new Error(`Unable to create experience: ${JSON.stringify(resp, null, 2)}`)
  }
  return newExperience
}

const TaskStatus = {
  Failed: TaskStatusEnum.NUMBER_0,
  Draft:  TaskStatusEnum.NUMBER_1,
  Pending: TaskStatusEnum.NUMBER_2,
  Running: TaskStatusEnum.NUMBER_3,
  Done: TaskStatusEnum.NUMBER_4
}

const ResultStatus = {
  Failed: ResultStatusEnum.NUMBER_0,
  Draft:  ResultStatusEnum.NUMBER_1,
  Pending: ResultStatusEnum.NUMBER_2,
  Running: ResultStatusEnum.NUMBER_3,
  Done: ResultStatusEnum.NUMBER_4
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  await login()

  const wasabiSelection = await getOrCreateWasabiSelection()
  const wasabiExperience = await getOrCreateWasabiExperience()

  const file = await fsPromises.readFile('input.json')
  const stations = JSON.parse(file.toString())

  const promises = stations.map(async (station) => {
    // Create item
    const item = await api.createItem({
      item: {
        title: station.title,
        description: `Music from ${station.name} - ${station.albumTitle}`,
        externalUri: station.urlDeezer,
        provider: PROVIDER_URL
      }
    })

    // Add created item to WASABI Selection
    const updatedSelection = await api.partialUpdateSelection({
      uuid: wasabiSelection.uuid,
      selection: {
        items: [ `/timeside/api/items/${item.uuid}/` ]
      }
    })
    // console.log('Selection updated', updatedSelection)

    // Create task
    const task = await api.createTask({
      task: {
        experience: `/timeside/api/experiences/${wasabiExperience.uuid}/`,
        selection: `/timeside/api/selections/${wasabiSelection.uuid}/`,
        item: `/timeside/api/items/${item.uuid}/`,
        status: TaskStatus.Pending
      }
    })
    // console.log('Task created', task)

    // Wait until all results for the created item are done processing
    const fibonacci = [ 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233 ]
    let isDone = false
    let iteration = 0
    do {
      const results = await api.listResults({ itemUuid: item.uuid })
      const undoneResults = results.filter((r) => r.status !== ResultStatus.Done)
      if (undoneResults.length === 0) {
        console.log(`${results.length} results successfully processed`)
        isDone = true
      }
      iteration++
      await sleep(fibonacci[iteration])
    } while (!isDone && iteration < 10)

      if (iteration === 10 && !isDone) {
        console.error(`Unable to get result after ${iteration} iterations`)
        return
      }

    console.log(`Item's player URL: https://ircam-web.github.io/timeside-player/#/item/${item.uuid}`)
  })

  // Run all promises concurrently
  await Promise.all(promises)

  console.log(`Created ${stations.length} items`)
  // You may want to list items
  // console.log(await api.listItems({}))
}

main()
  .catch((e) => {
    console.error(e)
  })
