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
  // 404 on timeside-sdk/.d.ts
  // } from 'https://cdn.pika.dev/@ircam/timeside-sdk@2.1.3'

  // } from 'https://unpkg.com/@ircam/timeside-sdk@2.1.3/dist/index.js'
  } from '../../timeside-sdk-js/src/index.ts'

  // error: Uncaught SyntaxError: The requested module '../../timeside-sdk-js/dist/index.js' does not provide an export named 'JWTToken'
  // } from '../../timeside-sdk-js/dist/index.js'

const basePath = 'https://sandbox.wasabi.telemeta.org'

// This helper saves the JWTToken to window.localStorage
// You may also implements your own way of storing your Token
// by implementing the PersistentJWTToken interface
const persistentToken = new InMemoryJWTToken()
persistentToken.init()

const rawApi = new TimesideApi(new Configuration({ basePath }))
// Configuration to auto-refresh token when needed
const api = new TimesideApi(new Configuration(AutoRefreshConfiguration({ basePath }, persistentToken)))

async function login () {
  const tokenObtainPair = { username: 'ircam-test', password: 'Chot8Cloabyav]' }
  const token = await rawApi.createTokenObtainPair({ tokenObtainPair })
  if (!token.access || !token.refresh) {
    throw new Error('unexpected empty access or refresh token')
  }
  persistentToken.token = JWTToken.fromBase64(token.access, token.refresh)
}

await login()
console.log(await api.listItems({}))
