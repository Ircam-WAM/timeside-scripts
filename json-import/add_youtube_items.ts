import {
  TimesideApi,
  ServerSideConfiguration,
  Item,
  Selection,
  Experience,
  TaskStatus,
  Task,
} from '@ircam/timeside-sdk'
import { config as dotenv } from 'dotenv'
import logger from './logger'

// Node standard library imports
import { performance } from 'perf_hooks'
import fs, { promises as fsPromises } from 'fs'
import url from 'url'
import path from 'path'

// Node polyfill
import crossFetch from 'cross-fetch'
import formData from 'form-data'
import fetchBlob from 'fetch-blob'

// Polyfill FormData because SDK use `new FormData`
// @ts-ignore
global.FormData = formData
// Polyfill Blob because SDK needs use `new Blob`
// @ts-ignore
global.Blob = fetchBlob

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
  /*basePath: 'https://timeside.ircam.fr',*/
  basePath: 'http://localhost:9080',
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

function validateStation (station: Station) {
  if (!station.title) {
    throw new Error(`Invalid station: Empty title: ${JSON.stringify(station)}`)
  }
  if (!station.url) {
    throw new Error(`Invalid station: Empty url: ${JSON.stringify(station)}`)
  }
  if (!station.name) {
    throw new Error(`Invalid station: Empty name: ${JSON.stringify(station)}`)
  }
  if (!station.albumTitle) {
    throw new Error(`Invalid station: Empty albumTitle: ${JSON.stringify(station)}`)
  }
}

// Hardcoded uuid / hyperlinks
const PRESETS = {
  aubioPitch: '/timeside/api/presets/38ec5bf4-9a2f-4733-a7a2-ec41d25724f6/',
  meanDcPitch: '/timeside/api/presets/bdd4456e-7239-4fb2-b1c3-58831f045aa1/',
  // FIXME: spectrogram is broken on the API
  // See https://github.com/Parisson/TimeSide/issues/200
  // spectrogram: '/timeside/api/presets/3a5ea98d-ac74-4658-b649-ac7d0ef6f052/',
  flacAubio: '/timeside/api/presets/44778ece-fe2d-47bb-b590-4c3ce79e1dae/'
}

const PROVIDERS = {
  YOUTUBE: '/timeside/api/providers/e011cca7-a0b9-45cc-9b31-fc1cbf8f54f5/',
  DEEZER: '/timeside/api/providers/dbed86a2-c153-4ed5-a0b3-cef5fcbda7bf/'
}

// Usage example :
// getProviderUri('https://www.youtube.com/watch?v=UBPI95GIbGg')
// getProviderUri('http://www.deezer.com/track/4763165')
function getProviderUrl(sourceUrl: string): string | undefined {
  const parsed = (() => {
    try {
      const url = new URL(sourceUrl)
      return url
    } catch (e) {
      return undefined
    }
  })()
  if (parsed === undefined) {
    return undefined
  }
  if (parsed.hostname === 'www.youtube.com') {
    return PROVIDERS.YOUTUBE
  } else if (parsed.hostname === 'www.deezer.com') {
    return PROVIDERS.DEEZER
  }
  return undefined
}

function compareArray (a: string[], b: string[]): boolean {
  return a.length === b.length &&
    a.every((val, idx) => val === b[idx])
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
  const experienceBody = {
    title: wasabiTitle,
    presets: Object.values(PRESETS)
  }

  const experiences = await api.listExperiences()
  const existing = experiences.find((e) => e.title === wasabiTitle)

  if (existing) {
    // Remove domain from URL for comparaison
    const existingPresets = existing.presets.map(fullUrl => new URL(fullUrl).pathname)
    const isSamePresets = compareArray(existingPresets, experienceBody.presets)
    if (isSamePresets) {
      return existing
    }
    return await api.updateExperience({
      uuid: existing.uuid,
      experience: experienceBody
    })
  }

  let newExperience: Experience
  try {
    newExperience = await api.createExperience({ experience: experienceBody })
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
  const importFile = process.argv[2]
  if (!importFile) {
    console.error('Missing required input parameter.\nExample "npm run start samples/youtube.json"')
    return
  }
  const importFileURL = new URL(importFile, `file:///${process.cwd()}/`)

  const file = await fsPromises.readFile(importFileURL)
  const stations: Station[] = JSON.parse(file.toString())

  if (stations.length === 0) {
    logger.error(`Unexpected empty station array (${importFile}). Leaving now`)
    return
  }

  const wasabiSelection = await getOrCreateWasabiSelection()
  logger.info(`WASABI Selection: ${wasabiSelection.uuid}`)

  const wasabiExperience = await getOrCreateWasabiExperience()
  logger.info(`WASABI Experience: ${wasabiExperience.uuid}`)

  const parsedStationsPromises = stations.map(async station => {
    // Check stations and throws if it fails
    validateStation(station)

    let itemSource: Item = {}

    const isHttpSource = /^https?:\/\//.test(station.url)
    const provider = getProviderUrl(station.url)
    if (isHttpSource && provider) {
      // Create item with provider (Youtube / Deezer)
      itemSource = {
        externalUri: station.url,
        provider
      }
    } else if (isHttpSource) {
      // Create item with externalUri
      itemSource = {
        sourceUrl: station.url
      }
    } else {
      // Get file path relative to the import file location (input.json)
      const importDirURL = url.pathToFileURL(path.dirname(url.fileURLToPath(importFileURL)))
      const audioFileURL = new URL(station.url, `${importDirURL}/`)

      // Check file exist and is readable
      const stat = await fsPromises.stat(audioFileURL)
      if (!stat.isFile()) {
        logger.error(`${audioFileURL} is not a file`)
        return
      }

      itemSource = {
        // Using fs.createReadStream as we are using `form-data` package
        // which is not a standard implementation of FormData
        sourceFile: fs.createReadStream(audioFileURL) as unknown as Blob
      }
    }

    return {
      ...station,
      source: itemSource
    }
  })

  const parsedStations = await Promise.all(parsedStationsPromises)

  logger.info(`Parsed ${stations.length} items. Importing...`)

  // Create an array of promises to run tasks concurrently
  const promises = parsedStations.map(async (station) => {
    // Create item
    const item = await api.createItem({
      item: {
        title: station.title,
        description: `Music from ${station.name} - ${station.albumTitle}`,
        ...station.source
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

    logger.info(`"${station.title}" - Task created: ${task.uuid}`)

    // Wait until all task is done
    // Variant of fibonnaci used for waiting
    const fibonacci = [
      1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89,
      144, 144, 144, 144, 233, 233, 233, 233, 233,
      377, 377, 377, 377, 377, 377, 377, 377, 377,
    ]
    const maxIteration = fibonacci.length - 1
    let isDone = false
    let iteration = 0
    let lastTask: Task
    do {
      lastTask = await api.retrieveTask({ uuid: task.uuid })
      isDone = lastTask.status === TaskStatus.Done

      await sleep(fibonacci[iteration] * 1000)
      iteration++
    } while (!isDone && iteration <= maxIteration)
      if (iteration === maxIteration && !isDone) {
        logger.warning(`"${station.title} - Unable to get result after ${iteration} iteration for task "${task.uuid}"`)
        return
      }

    const t1 = performance.now()
    const taskRuntime = Math.round(t1 - t0) // in milliseconds

    const playerURL = `https://ircam-web.github.io/timeside-player/#/item/${item.uuid}`

    logger.info(`"${station.title}" - Task done (${taskRuntime}ms) : ${task.uuid}`)
    logger.info(`"${station.title}" - Player URL: ${playerURL}`)
  })

  // Wait for all promises to resolve
  await Promise.all(promises)

  logger.info(`Created ${stations.length} items`)
}

main()
  .catch((e) => {
    console.error(e)
  })
