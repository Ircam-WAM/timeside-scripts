import { createLogger, format, transports } from 'winston'

const logger = createLogger({
  level: 'info',
  transports: [new transports.Console()],
  format: format.combine(
    format.colorize(),
    format.label({ label: 'import' }),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.printf(({ level, label, message, timestamp }) => {
      return `${timestamp} [${label}] ${level}: ${message}`
    }),
  )
})

export default logger
