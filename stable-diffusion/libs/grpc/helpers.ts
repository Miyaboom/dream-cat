import * as Generation from '../../generation/generation_pb';
import { GenerationServiceClient, Status } from '../../generation/generation_pb_service';
import { grpc as GRPCWeb } from '@improbable-eng/grpc-web';
import fs from 'fs';
import { ArtifactTypeMap, FinishReasonMap } from '../../generation/generation_pb';

export type GenerationTextPrompt = {
  /** The text prompt, maximum of 2000 characters. */
  text: string;
  /** The weight of the prompt, use negative values for negative prompts. */
  weight?: number;
};

export type CommonGenerationParams = {
  prompts: GenerationTextPrompt[];
  samples?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: Generation.DiffusionSamplerMap[keyof Generation.DiffusionSamplerMap];
  clipGuidancePreset?: Generation.GuidancePresetMap[keyof Generation.GuidancePresetMap];
  seed?: number;
};

// リクエストを作成
export function buildGenerationRequest(
  engineId: string,
  params: CommonGenerationParams & {
    type: string;
    width: number;
    height: number;
  }
) {
  const request = new Generation.Request();
  const imageParams = new Generation.ImageParameters();
  const samplerParams = new Generation.SamplerParameters();
  const stepParams = new Generation.StepParameter();
  const transformType = new Generation.TransformType();

  samplerParams.setCfgScale(params.cfgScale || 7);

  stepParams.setSampler(samplerParams);

  transformType.setDiffusion(params.sampler || Generation.DiffusionSampler.SAMPLER_K_DPMPP_2M);

  imageParams.setSamples(params.samples || 1);
  imageParams.setSteps(params.steps || 30);
  imageParams.setSamples(params.samples || 1);
  imageParams.setParametersList([stepParams]);
  imageParams.setTransform(transformType);
  imageParams.setWidth(params.width || 512);
  imageParams.setHeight(params.height || 512);

  request.setEngineId(engineId);
  request.setImage(imageParams);

  const textPrompts = params.prompts.map((prompt) => {
    const textPrompt = new Generation.Prompt();
    const promptParams = new Generation.PromptParameters();

    promptParams.setWeight(prompt.weight || 0.5);

    textPrompt.setText(prompt.text);
    textPrompt.setParameters(promptParams);

    return textPrompt;
  });
  request.setPromptList(textPrompts);

  return request;
}

// リクエストを実行
export function executeGenerationRequest(
  client: GenerationServiceClient,
  request: Generation.Request,
  metadata?: GRPCWeb.Metadata
) {
  return new Promise<Generation.Answer>((resolve, reject) => {
    const stream = client.generate(request, metadata);
    stream.on('data', (response) => {
      resolve(response);
    });
    stream.on('status', (status) => {
      console.log(status.code);
      if (status.code !== GRPCWeb.Code.OK) {
        reject(status);
      }
    });
    stream.on('end', (end) => {
      console.log(end?.code);
      if (end?.code !== GRPCWeb.Code.OK) {
        reject(end);
      }
    });
  });
}
