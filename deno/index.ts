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
} from 'https://cdn.pika.dev/@ircam/timeside-sdk@2.1.3'

const tokenObtainPair = { username: API_USER, password: API_PASS }
const token = await rawApi.createTokenObtainPair({ tokenObtainPair })
persistentToken.token = JWTToken.fromBase64(token.access, token.refresh)
