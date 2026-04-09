export type TableMode = 'off' | 'fast' | 'accurate'
export type ImageHandling = 'none' | 'referenced' | 'embedded'
export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'cancelled'
export type BatchStatus = 'queued' | 'processing' | 'done' | 'failed' | 'partial' | 'cancelled'

export type ConversionSettings = {
  ocr_enabled: boolean
  table_mode: TableMode
  image_handling: ImageHandling
}

export type PartialConversionSettings = Partial<ConversionSettings>

export type Job = {
  id: string
  batch_id: string
  original_filename: string
  stored_pdf_path: string
  markdown_path: string
  assets_dir_path: string
  zip_entry_name: string
  status: JobStatus
  progress: number
  settings_json: ConversionSettings
  error_message: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export type Batch = {
  id: string
  created_at: string
  default_settings_json: ConversionSettings
  status: BatchStatus
  file_count: number
  jobs: Job[]
}

export type FileOverrideState = {
  ocr_enabled?: boolean
  table_mode?: TableMode
  image_handling?: ImageHandling
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.text()
    throw new Error(payload || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchBatches(): Promise<Batch[]> {
  const response = await fetch('/api/batches')
  return parseResponse<Batch[]>(response)
}

export async function fetchJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${jobId}`)
  return parseResponse<Job>(response)
}

export async function fetchMarkdown(jobId: string): Promise<string> {
  const response = await fetch(`/api/jobs/${jobId}/markdown`)
  if (!response.ok) {
    const payload = await response.text()
    throw new Error(payload || `Request failed with ${response.status}`)
  }
  return response.text()
}

export async function retryJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${jobId}/retry`, {
    method: 'POST',
  })
  return parseResponse<Job>(response)
}

export async function cancelJob(jobId: string): Promise<Job> {
  const response = await fetch(`/api/jobs/${jobId}/cancel`, {
    method: 'POST',
  })
  return parseResponse<Job>(response)
}

export async function createBatch(args: {
  files: File[]
  settings: ConversionSettings
  overrides: Record<string, PartialConversionSettings>
}): Promise<Batch> {
  const formData = new FormData()
  for (const file of args.files) {
    formData.append('files', file)
  }
  formData.append('settings', JSON.stringify(args.settings))
  formData.append('overrides', JSON.stringify(args.overrides))

  const response = await fetch('/api/batches', {
    method: 'POST',
    body: formData,
  })

  return parseResponse<Batch>(response)
}

export function jobSourceUrl(jobId: string): string {
  return `/api/jobs/${jobId}/source`
}

export function jobDownloadUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download`
}

export function batchDownloadUrl(batchId: string): string {
  return `/api/batches/${batchId}/download`
}

export function allBatchesDownloadUrl(): string {
  return '/api/batches/download-all'
}

export async function deleteAllBatches(): Promise<{ deleted: number }> {
  const response = await fetch('/api/batches', { method: 'DELETE' })
  return parseResponse<{ deleted: number }>(response)
}
