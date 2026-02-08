import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { DatabaseConnection } from './types'

// Get the user data path and create config directory
function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  const configDir = join(userDataPath, 'config')
  
  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  
  return join(configDir, 'connections.json')
}

function readConnectionsFile(): DatabaseConnection[] {
  try {
    const configPath = getConfigPath()
    if (!existsSync(configPath)) {
      return []
    }
    const data = readFileSync(configPath, 'utf-8')
    return JSON.parse(data) as DatabaseConnection[]
  } catch (error) {
    console.error('Failed to read connections file:', error)
    return []
  }
}

function writeConnectionsFile(connections: DatabaseConnection[]): void {
  try {
    const configPath = getConfigPath()
    writeFileSync(configPath, JSON.stringify(connections, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to write connections file:', error)
  }
}

export function getConnections(): DatabaseConnection[] {
  return readConnectionsFile()
}

export function saveConnection(connection: DatabaseConnection): void {
  const connections = readConnectionsFile()
  const existingIndex = connections.findIndex(c => c.id === connection.id)
  
  if (existingIndex >= 0) {
    // Update existing
    connections[existingIndex] = connection
  } else {
    // Add new
    connections.push(connection)
  }
  
  writeConnectionsFile(connections)
}

export function deleteConnection(connectionId: string): void {
  const connections = readConnectionsFile()
  const filtered = connections.filter(c => c.id !== connectionId)
  writeConnectionsFile(filtered)
}

export function clearConnections(): void {
  writeConnectionsFile([])
}
