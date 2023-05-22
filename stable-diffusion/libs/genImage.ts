import fs from "fs";
import * as Generation from "../generation/generation_pb";
import {
  buildGenerationRequest,
  executeGenerationRequest,
} from "./grpc/helpers";
import { client } from "./grpc/client";

// Stable Diffusionのバージョン、APIのホスト、APIキーを指定
const engineId = 'stable-diffusion-xl-beta-v2-2-2';
const apiHost = process.env.API_HOST ?? 'https://api.stability.ai';
const apiKey = process.env.STABILITY_API_KEY;
if (!apiKey) throw new Error('Missing Stability API key.');

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

  // const request = buildGenerationRequest("stable-diffusion-xl-beta-v2-2-2", {
  //   type: "text-to-image",
  //   prompts: props.prompts,
  //   width: props.width || 512,
  //   height: props.height || 512,
  //   samples: 1,
  //   cfgScale: 8,
  //   steps: 30,
  //   seed: 992446758,
  //   sampler: Generation.DiffusionSampler.SAMPLER_K_DPMPP_2M,
  // });

  // const imagesBuffer: Buffer[] = []

  // executeGenerationRequest(client, request)
  // .then((response) => {
  //   const artifacts = response.getArtifactsList();
  //   artifacts.forEach((artifact) => {
  //     imagesBuffer.push(Buffer.from(artifact.getBinary_asU8()));
  //   });
  // })
  // .catch((error) => {
  //   console.error("Failed to make text-to-image request:", error);
  // });

  // return imagesBuffer;

  const response = await fetch(
    `${apiHost}/v1/generation/${props.engineId || engineId}/text-to-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text_prompts: props.prompts,
        cfg_scale: 7,
        clip_guidance_preset: 'FAST_BLUE',
        height: props.height || 512,
        width: props.width || 512,
        samples: 1,
        steps: 30
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Non-200 response: ${await response.text()}`);
  }

  const responseJSON = (await response.json()) as GenerationResponse;

  return responseJSON.artifacts.map((image, index) => Buffer.from(image.base64, 'base64'));
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

export async function imageToImage(props: ImageToImageProps) {

}

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

const isNumeric = (n:string) => !!Number(n);