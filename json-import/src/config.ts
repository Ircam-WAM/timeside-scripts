import { config as dotenv } from 'dotenv'

// Node polyfill
import formData from 'form-data'
import fetchBlob from 'fetch-blob'

import crossFetch from 'cross-fetch'

const load = function load () {
  // Polyfill FormData because SDK use `new FormData`
  // @ts-ignore
  global.FormData = formData
  // Polyfill Blob because SDK needs use `new Blob`
  // @ts-ignore
  global.Blob = fetchBlob

  // Load environment variables from .env file
  dotenv()
}

const mustGetEnv =  function mustGetEnv (envVar: string) {
  const val = process.env[envVar]
  if (!val) {
    throw new Error(`Empty environment variable: ${envVar}`)
  }
  return val
}

export { load, mustGetEnv, crossFetch }