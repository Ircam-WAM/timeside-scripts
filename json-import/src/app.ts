import {
  TimesideApi,
  Item,
} from '@ircam/timeside-sdk'

import * as timeside from './timeside'
import logger from './logger'

// Node standard library imports
import fs, { promises as fsPromises } from 'fs'
import url from 'url'
import path from 'path'

const init = async function (api: TimesideApi) {
  const importFile = process.argv[2]
  if (!importFile) {
    console.error('Missing required input parameter.\nExample "npm run start samples/youtube.json"')
    return
  }
  const importFileURL = new URL(importFile, `file:///${process.cwd()}/`)

  const file = await fsPromises.readFile(importFileURL)
  const stations: timeside.Station[] = JSON.parse(file.toString())

  if (stations.length === 0) {
    logger.error(`Unexpected empty station array (${importFile}). Leaving now`)
    return
  }

  const wasabiSelection = await timeside.getOrCreateWasabiSelection(api)
  logger.info(`WASABI Selection: ${wasabiSelection.uuid}`)

  const wasabiExperience = await timeside.getOrCreateWasabiExperience(api)
  logger.info(`WASABI Experience: ${wasabiExperience.uuid}`)

  const parsedStationsPromises = stations.map(async station => {
    // Check stations and throws if it fails
    timeside.validateStation(station)

    let itemSource: Item = {}

    const isHttpSource = /^https?:\/\//.test(station.url)
    const provider = timeside.getProviderUrl(station.url)
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

    const playerURL = `https://ircam-wam.github.io/timeside-player/#/item/${item.uuid}`

    logger.info(`"${station.title}" - Player URL: ${playerURL}`)
  })

  // Wait for all promises to resolve
  await Promise.all(promises)

  logger.info(`Created ${stations.length} items`)
}

export default init