import crossFetch from 'cross-fetch'
import {
  TimesideApi,
  ServerSideConfiguration,
  Selection,
  Experience,
  TaskStatus,
  Task,
} from '@ircam/timeside-sdk'
import { config as dotenv } from 'dotenv'
import formDataNode from 'formdata-node'

// Node library imports
import { performance } from 'perf_hooks'
import { promises as fsPromises } from 'fs'

// Polyfill FormData because SDK use `new FormData`
// @ts-ignore
global.FormData = formDataNode

// Load environment variables from .env file
dotenv()

function mustGetEnv (envVar: string) {
  const val = process.env[envVar]
  if (!val) {
    throw new Error(`Empty environment variable: ${envVar}`)
  }
  return val
}

const api = new TimesideApi(ServerSideConfiguration({
  // Use sandbox endpoint
  basePath: 'https://sandbox.wasabi.telemeta.org',
  // Credentials (get from environment)
  username: mustGetEnv('TIMESIDE_API_USER'),
  password: mustGetEnv('TIMESIDE_API_PASS'),
  // Use alternative fetch API (for Node / Polyfill)
  fetchApi: crossFetch,
}))

// Defined from ./input.json
interface Station {
  title: string;
  url: string;
  name: string;
  albumTitle: string;
}

// Hardcoded uuid / hyperlinks
const PRESETS = {
  aubioPitch: '/timeside/api/presets/842d911f-7dc2-4922-b861-fa8a3e076f72/',
  spectrogram: '/timeside/api/presets/3a5ea98d-ac74-4658-b649-ac7d0ef6f052/',
  meanDcPitch: '/timeside/api/presets/fe7a0c2c-57a8-4bf2-884c-b7a30f22a8dc/',
  // FIXME:
  // - flac breaks player for deezer items
  // - flac is re-encoded when loading player on youtbe items
  flacAubio: '/timeside/api/presets/d7df195a-f15e-4e1b-9678-8f64d379ac42/'
}

const PROVIDERS = {
  YOUTUBE: '/timeside/api/providers/4f239dd8-c6fe-4888-b131-445b712f2b15/',
  DEEZER: '/timeside/api/providers/32dd516a-5759-43fd-bc95-3d08eebee196/'
}

// getProviderUri('https://www.youtube.com/watch?v=UBPI95GIbGg')
// getProviderUri('http://www.deezer.com/track/4763165')
function getProviderUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl)
  if (parsed.hostname === 'www.youtube.com') {
    return PROVIDERS.YOUTUBE
  } else if (parsed.hostname === 'www.deezer.com') {
    return PROVIDERS.DEEZER
  }
  throw new Error('Unknown URL type (excpected deezer or youtube URL)')
}

async function getOrCreateWasabiSelection (): Promise<Selection> {
  const wasabiTitle = 'WASABI'
  const selections = await api.listSelections()
  const existing = selections.find((s) => s.title === wasabiTitle)
  if (existing) {
    return existing
  }
  let newSelection: Selection
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

  let newExperience: Experience
  try {
    newExperience = await api.createExperience({ experience: { title: wasabiTitle, presets: Object.values(PRESETS) } })
  } catch (e) {
    const resp = await e.json()
    throw new Error(`Unable to create experience: ${JSON.stringify(resp, null, 2)}`)
  }
  return newExperience
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const wasabiSelection = await getOrCreateWasabiSelection()
  console.log(`[${new Date().toISOString()}] WASABI Selection: ${wasabiSelection.uuid}`)

  const wasabiExperience = await getOrCreateWasabiExperience()
  console.log(`[${new Date().toISOString()}] WASABI Experience: ${wasabiExperience.uuid}`)

  const file = await fsPromises.readFile('input.json')
  const stations: Station[] = JSON.parse(file.toString())

  console.log(`[${new Date().toISOString()}] Parsed ${stations.length} items. Importing...`)

  // Create an array of promises to run tasks concurrently
  const promises = stations.map(async (station) => {
    // Create item
    const item = await api.createItem({
      item: {
        title: station.title,
        description: `Music from ${station.name} - ${station.albumTitle}`,
        externalUri: station.url,
        provider: getProviderUrl(station.url)
      }
    })

    // Add created item to WASABI Selection
    const updatedSelection = await api.partialUpdateSelection({
      uuid: wasabiSelection.uuid,
      selection: {
        items: [ `/timeside/api/items/${item.uuid}/` ]
      }
    })

    // Create task
    const task = await api.createTask({
      task: {
        experience: `/timeside/api/experiences/${wasabiExperience.uuid}/`,
        selection: `/timeside/api/selections/${updatedSelection.uuid}/`,
        item: `/timeside/api/items/${item.uuid}/`,
        status: TaskStatus.Pending
      }
    })

    const t0 = performance.now()

    console.log(`[${new Date().toISOString()}] "${station.title}" - Task created: ${task.uuid}`)

    // Wait until all task is done
    const fibonacci = [ 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233 ]
    let isDone = false
    let iteration = 0
    let lastTask: Task
    do {
      lastTask = await api.retrieveTask({ uuid: task.uuid })
      isDone = lastTask.status === TaskStatus.Done

      // We could alternatively wait for every results
      // for this item to be processed
      // But this would raise issues for concurrent imports

      // const results = await api.listResults({ itemUuid: item.uuid })
      // const undoneResults = results.filter((r) => r.status !== ResultStatus.Done)
      // if (undoneResults.length === 0) {
      //   console.log(`${results.length} results successfully processed`)
      //   isDone = true
      // }

      iteration++
      await sleep(fibonacci[iteration] * 1000)
    } while (!isDone && iteration < 10)
      if (iteration === 10 && !isDone) {
        console.error(`Unable to get result after ${iteration} iterations`)
        return
      }

    const t1 = performance.now()
    const taskRuntime = Math.round(t1 - t0) // in milliseconds

    console.log(`[${new Date().toISOString()}] "${station.title}" - Task done: ${task.uuid} in ${taskRuntime}ms`)
    console.log(`[${new Date().toISOString()}] "${station.title}" - Player URL: https://ircam-web.github.io/timeside-player/#/item/${item.uuid}`)
  })

  // Wait for all promises to resolve
  await Promise.all(promises)

  console.log(`[${new Date().toISOString()}] Created ${stations.length} items`)
  // You may want to list items
  // console.log(await api.listItems({}))
}

main()
  .catch((e) => {
    console.error(e)
  })
