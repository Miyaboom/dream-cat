import fs from 'fs';
import * as Generation from '../generation/generation_pb';
import { buildGenerationRequest, executeGenerationRequest } from './grpc/helpers';
import { client, metadata } from './grpc/client';

interface GenerationResponse {
  artifacts: Array<{
    base64: string;
    seed: number;
    finishReason: string;
  }>;
}

interface TextToImageProps {
  prompts: {
    text: string;
    weight?: number;
  }[];
  width: number;
  height: number;
  engineId?: string;
}

export async function textToImage(props: TextToImageProps) {
  const request = buildGenerationRequest('stable-diffusion-xl-beta-v2-2-2', {
    type: 'text-to-image',
    prompts: props.prompts,
    width: props.width || 512,
    height: props.height || 512,
    samples: 1,
    cfgScale: 8,
    steps: 30,
    seed: 992446758,
    sampler: Generation.DiffusionSampler.SAMPLER_K_DPMPP_2M
  });

  const imagesBuffer: Buffer[] = [];

  const response = await executeGenerationRequest(client, request, metadata).catch((error) => {
    console.error('Failed to make text-to-image request:', error);
  });

  if (!response) {
    throw new Error('Failed to make text-to-image request');
  }

  const artifacts = response.getArtifactsList();
  console.log(artifacts)
  artifacts.forEach((artifact) => {
    imagesBuffer.push(Buffer.from(artifact.getBinary_asU8()));
  });

  return imagesBuffer;
}

interface ImageToImageProps {
  prompts: {
    text: string;
    weight?: number;
  }[];
  width: number;
  height: number;
  engineId?: string;
}

export async function imageToImage(props: ImageToImageProps) {}

// プロンプトをAPIの入力形式に変換
export function convertPromptForAPIInput(text: string) {
  const lines = text.split(',');
  const prompts = lines.map((line) => {
    const [text, weight] = line.split(':');
    // 重みを指定する場合
    if (isNumeric(weight)) {
      return {
        text: text,
        weight: Number(weight)
      };
    } else {
      return {
        text: line
      };
    }
  });

  return prompts;
}

const isNumeric = (n: string) => !!Number(n);
