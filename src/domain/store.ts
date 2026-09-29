import { loadAppData, saveAppData } from './repository'
import type { AppData } from './types'

export interface AppStore {
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
}

export class LocalStorageStore implements AppStore {
  load(): Promise<AppData> {
    return Promise.resolve(loadAppData())
  }

  save(data: AppData): Promise<void> {
    saveAppData(data)
    return Promise.resolve()
  }
}
