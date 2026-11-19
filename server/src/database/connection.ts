import mongoose from 'mongoose'
import type { ServerConfig } from '../config/env.js'

export async function connectDatabase(config: ServerConfig): Promise<void> {
  await mongoose.connect(config.MONGODB_URI, {
    dbName: config.MONGODB_DB_NAME,
    autoIndex: config.NODE_ENV !== 'production',
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  })
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
}
