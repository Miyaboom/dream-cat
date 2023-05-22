import FormData from 'form-data';
import fetch, { RequestInit, Response } from 'node-fetch';

const url = 'https://slack.com/api/files.upload';

export async function uploadImage(
  buffer: Buffer,
  filename: string,
  options: { title?: string; channel?: string; thread_ts?: string }
): Promise<Response> {
  const form = new FormData();
  form.append('file', buffer, { contentType: 'image/png', filename });
  if (options.title) form.append('title', options.title);
  if (options.channel) form.append('channels', options.channel);
  if (options.thread_ts) form.append('thread_ts', options.thread_ts);

  const request: RequestInit = {
    method: 'POST',
    body: form,
    headers: {
      authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      ...form.getHeaders()
    }
  };

  return await fetch(url, request);
}
