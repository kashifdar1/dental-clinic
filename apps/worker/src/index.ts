export interface QueueMessage {
  id: string
  tenantId: string
  payload: unknown
}

export interface QueueAdapter {
  receive(signal: AbortSignal): AsyncIterable<QueueMessage>
  acknowledge(message: QueueMessage): Promise<void>
  retry(message: QueueMessage): Promise<void>
}

export interface MessageHandler {
  handle(message: QueueMessage): Promise<void>
}

export async function runWorker(
  queue: QueueAdapter,
  handler: MessageHandler,
  signal: AbortSignal,
): Promise<void> {
  for await (const message of queue.receive(signal)) {
    if (signal.aborted) return
    try {
      await handler.handle(message)
      await queue.acknowledge(message)
    } catch {
      await queue.retry(message)
    }
  }
}
