import { Configuration, OpenAIApi } from 'openai';

// OpenAI APIクライアントを初期化
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

// ChatGPT APIを使用してプロンプトを生成
interface Props {
  userContent: string;
  defaultSystemContent?: string;
  model?: string;
}

const model = 'gpt-3.5-turbo';
const defaultSystemContent = `Please act as a prompt generator for the Stable-Diffusion AI. From the provided sentence, enumerate the most characteristic elements and details about a specific scene or object in concise English sentences separated by commas. The Stable-Diffusion AI will generate images based on this. The more specific these keywords are, the more detailed the generated image will be. For example, if you want to generate an image of the Amazon jungle, consider keywords such as "Amazon, Jungle, Dense Rainforest, Green, Winding river".`;

export async function genPromptForStableDiffusion(
  props: Props = { userContent: '', defaultSystemContent }
) {
  const completion = await openai.createChatCompletion({
    model: props.model || model,
    messages: [
      {
        role: 'system',
        content: props.defaultSystemContent || defaultSystemContent
      },
      { role: 'user', content: props.userContent }
    ]
  });
  return completion.data.choices[0].message?.content;
}
