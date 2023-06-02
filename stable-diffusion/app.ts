import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { App, AwsLambdaReceiver, BlockAction, ButtonAction, LogLevel } from '@slack/bolt';
import { AwsCallback } from '@slack/bolt/dist/receivers/AwsLambdaReceiver';
import { genPromptForStableDiffusion } from './libs/genPrompt';
import { isJsonString } from './libs/isJsonString';
import { convertPromptForAPIInput, textToImage } from './libs/genImage';
import { WebClient } from '@slack/web-api';
import { uploadImage } from './libs/uploadImage';
const fs = require('fs');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

// Initialize the Lambda receiver
const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || ''
});

// Initialize Slack Web API client
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

// Initialize your app with your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  logLevel: LogLevel.DEBUG
});

// subscribe to 'app_mention' event in your App config
// need app_mentions:read and chat:write scopes
app.event('app_mention', async ({ event, say }) => {
  // スレッドのトップのメッセージであればthread_ts、スレッド中のメッセージであればtsを取得
  const threadTs = event.thread_ts ? event.thread_ts : event.ts;

  try {
    // メッセージがらメンションを削除
    const message = event.text.replace(/<@.*>/, '').trim();

    // メッセージが空の場合はエラー
    if (message === '') {
      await say({
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `メッセージ付きでメンションしてください。`
            }
          }
        ],
        thread_ts: threadTs
      });
      return;
    }

    // プロンプトを生成
    const prompt = (await genPromptForStableDiffusion({ userContent: message })) || '';

    await say({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `メッセージをもとにプロンプトを生成しました。プロンプトは必要に応じて修正してください。\n 画像サイズを選択し、生成ボタンを押してください。`
          }
        },
        {
          type: 'input',
          element: {
            type: 'plain_text_input',
            multiline: true,
            action_id: 'prompt_input',
            initial_value: prompt
          },
          label: {
            type: 'plain_text',
            text: 'プロンプト',
            emoji: true
          }
        },
        {
          type: 'input',
          element: {
            type: 'static_select',
            placeholder: {
              type: 'plain_text',
              text: 'Select an item',
              emoji: true
            },
            initial_option: {
              text: {
                type: 'plain_text',
                text: '512×512',
                emoji: true
              },
              value: '512×512'
            },
            options: [
              {
                text: {
                  type: 'plain_text',
                  text: '512×512',
                  emoji: true
                },
                value: '512×512'
              },
              {
                text: {
                  type: 'plain_text',
                  text: '1024x1024',
                  emoji: true
                },
                value: '1024x1024'
              }
            ],
            action_id: 'select_image_size'
          },
          label: {
            type: 'plain_text',
            text: '画像サイズ',
            emoji: true
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '生成',
                emoji: true
              },
              style: 'primary',
              value: 'gen_image',
              action_id: 'gen_image'
            }
          ]
        }
      ],
      thread_ts: threadTs
    });
  } catch (error) {
    await say({
      text: `エラーが発生しました。開発者にお問い合わせください。\n ${error}`,
      thread_ts: threadTs
    });

    console.error(error);
  }
});

// Slack上で画像生成ボタンを押したときの処理
app.action<BlockAction<ButtonAction>>('gen_image', async ({ context, body, ack, say }) => {
  await ack();
  const ts = body.message?.ts;
  const channnelId = body.channel?.id;

  if (!ts || !channnelId) return console.error(`ts or channnelId is undefined.`);

  try {

    // Stable Diffusion用のプロンプト, 画像サイズ
    let prompt = '';
    let imageWidth = 512;
    let imageHeight = 512;

    // スレッドのメッセージを10件まで取得
    const messages = await app.client.conversations.history({
      token: context.botToken,
      channel: channnelId,
      limit: 10,
      ts: ts
    });

    if (!body.state?.values) return console.error(`body.state?.values is undefined.`);

    Object.entries(body.state?.values).forEach(([blockId, value]) => {
      Object.keys(value).forEach(async (actionId) => {
        if (actionId === 'prompt_input') {
          const viewStateValue = value['prompt_input'];
          prompt = viewStateValue.value || '';
        }

        if (actionId === 'select_image_size') {
          const viewStateValue = value['select_image_size'];
          const imageSizes = viewStateValue.value?.split('x');
          if (imageSizes?.length === 2) {
            imageWidth = parseInt(imageSizes[0], 10);
            imageHeight = parseInt(imageSizes[1], 10);
          }
        }
      });
    });

    console.log(`prompt: ${prompt}`);
    console.log(`imageWidth: ${imageWidth}`);
    console.log(`imageHeight: ${imageHeight}`);

    // Stable Diffusionで画像を生成
    if (!prompt || !imageWidth || !imageHeight) return console.error(`prompt or imageWidth or imageHeight is undefined.`);

    // console.log(convertPromptForAPIInput(prompt))

    const imagesBuffer = await textToImage({
      prompts: [{text: prompt}],
      width: imageWidth,
      height: imageHeight
    });

    // スレッドの最後のメッセージからtimestampを取得
    const lastMessage = messages.messages?.[0]
    let threadTs = lastMessage?.thread_ts || lastMessage?.ts;

    const results = await Promise.all(
      imagesBuffer.map(async (imageData, index) => {
        return await uploadImage(imageData, `image_${index}.png`, {
          channel: channnelId,
          thread_ts: threadTs
        });
      })
    );

    const errorResults = results.filter((result) => {
      return !result.ok;
    });

    if (errorResults.length > 0) {
      await say({
        text: `画像アップロードに失敗しました。開発者にお問い合わせください。`,
        thread_ts: ts
      });
    }
  } catch (error) {
    await say({
      text: `エラーが発生しました。開発者にお問い合わせください。\n ${error}`,
      thread_ts: ts
    });

    console.error(error);
  }
});

export const lambdaHandler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: AwsCallback
) => {
  try {
    // SlackのURL検証
    if (isJsonString(event.body)) {
      const bodyJSON = JSON.parse(event.body || '');
      if (bodyJSON?.type === 'url_verification') {
        const body = {
          challenge: bodyJSON.challenge
        };
        callback(null, { statusCode: 200, body: JSON.stringify(body) });
        return;
      }
    }

    // Slackのリトライ処理を拒否
    if (event.headers['X-Slack-Retry-Num']) {
      return { statusCode: 200, body: JSON.stringify({ message: 'No need to resend' }) };
    }

    // Slackのイベント受信
    callback(null, { statusCode: 202, body: '' });
    const handler = await awsLambdaReceiver.start();
    return handler(event, context, callback);
  } catch (error) {
    console.error(error);
  }
};
