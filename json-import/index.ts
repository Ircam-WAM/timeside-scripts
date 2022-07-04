import {
  TimesideApi,
  ServerSideConfiguration
} from '@ircam/timeside-sdk'

import * as config from './src/config'
import init from './src/app'

config.load()

const api = new TimesideApi(ServerSideConfiguration({
  // Use sandbox endpoint
  basePath: 'https://ircam-wam.github.io',
  // Credentials (get from environment)
  username: config.mustGetEnv('TIMESIDE_API_USER'),
  password: config.mustGetEnv('TIMESIDE_API_PASS'),
  // Use alternative fetch API (for Node / Polyfill)
  fetchApi: config.crossFetch,
}))

function main() {
  init(api)
  .catch((e) => {
    console.error(e)
  })
}

main()
