import Redis from 'ioredis'
import type { KeyValueDriver, KeyInfo, ValkeyConnection } from './types'

export class ValkeyDriver implements KeyValueDriver {
  private client: Redis | null = null
  private config: Omit<ValkeyConnection, 'id' | 'name' | 'type'>

  constructor(config: Omit<ValkeyConnection, 'id' | 'name' | 'type'>) {
    this.config = config
  }

  async connect(): Promise<void> {
    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password || undefined,
      db: this.config.db || 0,
      lazyConnect: true,
      maxRetriesPerRequest: 3
    })

    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready'
  }

  async scanKeys(pattern = '*', count = 100): Promise<KeyInfo[]> {
    if (!this.client) throw new Error('Not connected')

    const keys: KeyInfo[] = []
    let cursor = '0'

    do {
      const [nextCursor, scannedKeys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        count
      )
      cursor = nextCursor

      // Get type and TTL for each key
      for (const key of scannedKeys) {
        const [type, ttl] = await Promise.all([
          this.getKeyType(key),
          this.client.ttl(key)
        ])

        keys.push({
          key,
          type: type as KeyInfo['type'],
          ttl: ttl > 0 ? ttl : undefined
        })
      }

      // Limit total keys to prevent memory issues
      if (keys.length >= 1000) break
    } while (cursor !== '0')

    return keys
  }

  async getKeyType(key: string): Promise<string> {
    if (!this.client) throw new Error('Not connected')
    return await this.client.type(key)
  }

  async getKeyValue(key: string): Promise<unknown> {
    if (!this.client) throw new Error('Not connected')

    const type = await this.getKeyType(key)

    switch (type) {
      case 'string':
        return await this.client.get(key)

      case 'hash':
        return await this.client.hgetall(key)

      case 'list': {
        const length = await this.client.llen(key)
        return await this.client.lrange(key, 0, Math.min(length - 1, 999))
      }

      case 'set':
        return await this.client.smembers(key)

      case 'zset': {
        const members = await this.client.zrange(key, 0, 999, 'WITHSCORES')
        // Convert flat array to pairs
        const pairs: { member: string; score: string }[] = []
        for (let i = 0; i < members.length; i += 2) {
          pairs.push({ member: members[i], score: members[i + 1] })
        }
        return pairs
      }

      case 'stream': {
        const entries = await this.client.xrange(key, '-', '+', 'COUNT', 100)
        return entries
      }

      default:
        return null
    }
  }

  async executeCommand(command: string): Promise<unknown> {
    if (!this.client) throw new Error('Not connected')

    const parts = command.trim().split(/\s+/)
    const cmd = parts[0].toUpperCase()
    const args = parts.slice(1)

    // Use sendCommand for raw command execution
    return await this.client.call(cmd, ...args)
  }
}
