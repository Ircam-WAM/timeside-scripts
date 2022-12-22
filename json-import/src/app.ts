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

import ytdl from 'ytdl-core'

const init = async function (api: TimesideApi) {
  const importFile = process.argv[2]
  if (!importFile) {
    console.error('Missing required input parameter.\nExample "npm run start samples/youtube.json"')
    return
  }
  const importFileURL = new URL(importFile, `file:///${process.cwd()}/`)

  const file = await fsPromises.readFile(importFileURL)

  const links: timeside.YoutubeLink[] = JSON.parse(file.toString())
  if (links.length === 0) {
    logger.error(`Unexpected empty links array (${importFile}). Leaving now`)
    return
  }

  const wasabiSelection = await timeside.getOrCreateWasabiSelection(api)
  logger.info(`WASABI Selection: ${wasabiSelection.uuid}`)

  const wasabiExperience = await timeside.getOrCreateWasabiExperience(api)
  logger.info(`WASABI Experience: ${wasabiExperience.uuid}`)

  const parsedLinksPromises = links.map(async youtubeLink => {
    // Check ids and throws if it fails
    timeside.validateYoutubeLink(youtubeLink)

    let itemSource: Item = {}

    const isHttpSource = /^https?:\/\//.test(youtubeLink.url)
    const provider = timeside.getProviderUrl(youtubeLink.url)

    if (isHttpSource && provider) {
      // Create item with provider (Youtube / Deezer)
      itemSource = {
        externalUri: youtubeLink.url,
        provider
      }
    } else if (isHttpSource) {
      // Create item with externalUri
      itemSource = {
        sourceUrl: youtubeLink.url
      }
    } else {
      // Get file path relative to the import file location (input.json)
      const importDirURL = url.pathToFileURL(path.dirname(url.fileURLToPath(importFileURL)))
      const audioFileURL = new URL(youtubeLink.url, `${importDirURL}/`)

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
      ...youtubeLink,
      source: itemSource
    }
  })

  // const parsedStations = await Promise.all(parsedStationsPromises)
  const parsedLinks = await Promise.all(parsedLinksPromises)

  // logger.info(`Parsed ${stations.length} items. Importing...`)
  logger.info(`Parsed ${links.length} items. Importing...`)

  const promises = parsedLinks.map(async (link) => {

    const ytData = await ytdl.getInfo(link.url)

    // Create item
    const item = await api.createItem({
      item: {
        title: link.title ? link.title : ytData.videoDetails.title,
        description: link.name && link.albumTitle ? `Music from ${link.name} - ${link.albumTitle}` : '',
        ...link.source
      }
    })

    const playerURL = `https://ircam-wam.github.io/timeside-player/#/item/${item.uuid}`

    logger.info(`Youtube link ID: "${link.id}" - Player URL: ${playerURL}`)
  })

  // Wait for all promises to resolve
  await Promise.all(promises)

  logger.info(`Created ${links.length} items`)
}

export default init