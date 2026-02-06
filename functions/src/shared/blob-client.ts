// =============================================================================
// MOSY — Shared Blob Storage Client
// Provides blob upload helpers for shift reports and dead-letter storage.
// =============================================================================

import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

let blobService: BlobServiceClient | null = null;

function getBlobService(): BlobServiceClient {
  if (!blobService) {
    const connString = process.env.STORAGE_CONNECTION_STRING;
    if (!connString) {
      throw new Error('STORAGE_CONNECTION_STRING environment variable is required');
    }
    blobService = BlobServiceClient.fromConnectionString(connString);
  }
  return blobService;
}

export function getContainerClient(containerName: string): ContainerClient {
  return getBlobService().getContainerClient(containerName);
}

export async function uploadBlob(
  containerName: string,
  blobName: string,
  content: Buffer,
  contentType: string
): Promise<string> {
  const containerClient = getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return blockBlobClient.url;
}

export async function uploadDeadLetter(
  functionName: string,
  messageId: string,
  payload: unknown,
  error: Error
): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  const blobName = `dead-letter/${functionName}/${date}/${messageId}.json`;
  const content = Buffer.from(
    JSON.stringify({
      functionName,
      messageId,
      error: { message: error.message, stack: error.stack },
      payload,
      timestamp: new Date().toISOString(),
    })
  );
  await uploadBlob('edge-logs', blobName, content, 'application/json');
}
