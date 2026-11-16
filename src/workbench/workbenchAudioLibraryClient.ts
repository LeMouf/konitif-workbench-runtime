/** HTTP adapter for a host's audio resource library. The host owns access and storage. */
export function createWorkbenchAudioLibraryClient<Resource>(
  baseUrl: string,
  request: typeof fetch = fetch
) {
  const collection = baseUrl.replace(/\/$/, '') + '/api/audio-library';

  async function responseJson(url: string, method = 'GET'): Promise<unknown> {
    const response = await request(url, { method });
    const body: unknown = await response.json();
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body
        ? body.message
        : undefined;
      throw new Error(typeof message === 'string' ? message : response.statusText);
    }
    return body;
  }

  function resourceUrl(id: string) {
    return collection + '/' + encodeURIComponent(id);
  }

  return {
    async list(trashed = false): Promise<Resource[]> {
      const result = await responseJson(trashed ? collection + '?trashed=1' : collection);
      if (!Array.isArray(result)) throw new Error('Invalid audio library response.');
      return result as Resource[];
    },
    async moveToTrash(id: string): Promise<void> {
      await responseJson(resourceUrl(id), 'DELETE');
    },
    async restore(id: string): Promise<void> {
      await responseJson(resourceUrl(id) + '/restore', 'POST');
    }
  };
}
