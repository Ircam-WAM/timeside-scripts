import { TimesideApi, Selection, Experience  } from '@ircam/timeside-sdk';
import { compareArray } from './helpers'

// Defined from ./input.json
interface YoutubeLink {
  id: string;
  url?: string;
  title?: string;
  name?: string;
  albumTitle?: string;
}

const validateYoutubeLink = function validateYoutubeLink (youtube_link: YoutubeLink) {
  if (!youtube_link.id && !youtube_link.url) {
    throw new Error(`Invalid youtube link: Empty id: ${JSON.stringify(youtube_link)}`)
  } else if (!youtube_link.id && youtube_link.url) {
    if (youtube_link.url.includes("watch?v=")) {
      youtube_link.id = youtube_link.url.split("watch?v=")[1]
    } else if (youtube_link.url.includes("youtu.be")) {
      youtube_link.id = youtube_link.url.split("youtu.be/")[1]
    } else {
      throw new Error(`Invalid youtube link: Empty id: ${JSON.stringify(youtube_link)}`)
    }
  }

  if (!youtube_link.url) {
    youtube_link.url = "https://www.youtube.com/watch?v=" + youtube_link.id
  } else if (youtube_link.url.includes("youtu.be")) {
    youtube_link.url = "https://www.youtube.com/watch?v=" + youtube_link.id
  }
}

interface Station {
  title: string;
  url: string;
  name: string;
  albumTitle: string;
}

const validateStation = function validateStation (station: Station) {
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
  waveformCentroid: '/api/presets/738a81fc-0a13-45d5-8d6a-3a6fb18d6cb1/',
  spectralCentroid: '/api/presets/b8bc895c-2e44-490b-85d9-5722b1a30950/',
  spectrogramLog: '/api/presets/17fcf229-d8cf-4d05-a80c-13161ec04646/'
  // aubioPitch: '/api/presets/662b3fc8-77ce-4241-80a8-f68e32dd9950/',
  // meanDcShift: '/api/presets/b750a952-0e4f-44e2-a548-5244a94af5b0/',
  // FIXME: spectrogram is broken on the API
  // See https://github.com/Parisson/TimeSide/issues/200
  // spectrogram: '/api/presets/3a5ea98d-ac74-4658-b649-ac7d0ef6f052/',
  // flacAubio: '/api/presets/b6ce08dd-1ba0-467c-8a07-adfd79aee00f/'
}

const PROVIDERS = {
  YOUTUBE: '/api/providers/13bce806-7d23-404d-b79e-e2234b7567c4/',
  DEEZER: '/api/providers/93aca979-a623-46fe-8bb1-03813f4c4c1f/'
}

// Usage example :
// getProviderUri('https://www.youtube.com/watch?v=UBPI95GIbGg')
// getProviderUri('http://www.deezer.com/track/4763165')
const getProviderUrl = function getProviderUrl(sourceUrl: string): string | undefined {
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

async function getOrCreateWasabiSelection (api: TimesideApi): Promise<Selection> {
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

async function getOrCreateWasabiExperience (api: TimesideApi): Promise<Experience> {
  const wasabiTitle = 'WASABI_experience'
  const experienceBody = {
    title: wasabiTitle,
    presets: Object.values(PRESETS)
  }

  const experiences = await api.listExperiences()
  const existing = experiences.find((e) => e.title === wasabiTitle)

  if (existing) {
    // Remove domain from URL for comparison
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


export { YoutubeLink, validateYoutubeLink, Station, validateStation, PRESETS, PROVIDERS, getProviderUrl, getOrCreateWasabiSelection, getOrCreateWasabiExperience }