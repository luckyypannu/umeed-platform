import { createInterface } from 'node:readline/promises'
import pino from 'pino'
import { parseEnvironment } from '../src/config/env.js'
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js'
import { hashPassword } from '../src/auth/crypto.js'
import { User } from '../src/models/user.js'

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
      reject(new Error('Admin provisioning requires an interactive terminal'))
      return
    }

    process.stdout.write(prompt)
    let value = ''
    const onData = (input: Buffer) => {
      const character = input.toString('utf8')
      if (character === '\u0003') {
        process.stdin.setRawMode(false)
        process.stdin.off('data', onData)
        process.stdin.pause()
        reject(new Error('Admin provisioning cancelled'))
        return
      }
      if (character === '\r' || character === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.off('data', onData)
        process.stdin.pause()
        process.stdout.write('\n')
        resolve(value)
        return
      }
      if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1)
        return
      }
      if (character >= ' ') value += character
    }

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onData)
  })
}

async function main(): Promise<void> {
  const config = parseEnvironment(process.env)
  if (config.NODE_ENV === 'production') {
    throw new Error('Admin provisioning is disabled in production')
  }

  const logger = pino({ level: config.LOG_LEVEL })
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const nameInput = await prompt.question('Admin name: ')
  const emailInput = await prompt.question('Admin email: ')
  prompt.close()

  const name = nameInput.trim()
  if (!name || name.length > 120) {
    throw new Error('Admin name must be between 1 and 120 characters')
  }

  const email = emailInput.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('A valid admin email is required')
  }

  const password = await readHidden('Admin password (minimum 12 characters): ')
  const confirmation = await readHidden('Confirm admin password: ')
  if (password.length < 12 || password.length > 128 || password !== confirmation) {
    throw new Error('Passwords must match and be between 12 and 128 characters')
  }

  await connectDatabase(config)
  try {
    await User.createIndexes()
    if (await User.exists({ email })) {
      throw new Error('An account with that email already exists; provisioning will not overwrite it')
    }

    const { hash, salt } = await hashPassword(password)
    await User.create({
      email,
      passwordHash: hash,
      salt,
      role: 'admin',
      name,
      phone: '',
      city: '',
      status: 'active',
    })
    logger.info('Admin account provisioned')
  } finally {
    await disconnectDatabase()
  }
}

void main().catch((error: unknown) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  logger.error(
    {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    },
    'Admin provisioning failed',
  )
  process.exitCode = 1
})
