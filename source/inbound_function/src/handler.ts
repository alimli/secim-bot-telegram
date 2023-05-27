import { Context } from "aws-lambda";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { LambdaFunctionEvent } from "./application/lambdaFunctionEvent";
import { UpdateMessage, PhotoSize } from "./application/telegramMessage";
import { v4 as uuidv4 } from "uuid";
import { sendToSqs } from "./application/sqsMessage";


export const handler = async (event: LambdaFunctionEvent, context: Context) => {
  const failedMessageIds: string[] = [];
  const region = process.env.AWS_REGION || "";
  const awsAccountID = context.invokedFunctionArn.split(":")[4];

  for (const record of event.Records) {
    try {
      const bodyMessage = Buffer.from(record.body, "base64").toString("binary");
      console.log(`Processing ${record.messageId}`);
      await handleRecord(region, awsAccountID, bodyMessage).then(
        () => console.log(`Successfully processed ${record.messageId}`)
      ).catch(
        () => {
          console.log(`Failed message ${record.messageId}`);
          failedMessageIds.push(record.messageId);
        }
      );
    } catch (error) {
      console.error(error);
      failedMessageIds.push(record.messageId);
    }
  };

  console.log({ failedMessageIds });

  return {
    // https://www.serverless.com/blog/improved-sqs-batch-error-handling-with-aws-lambda
    // https://docs.aws.amazon.com/prescriptive-guidance/latest/lambda-event-filtering-partial-batch-responses-for-sqs/best-practices-partial-batch-responses.html
    // https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting
    batchItemFailures: failedMessageIds.map(id => {
      return {
        itemIdentifier: id
      }
    })
  }
};

const handleRecord = async (region: string, awsAccountID: string, bodyMessage: string) => {
  try {
    const updateMessage: UpdateMessage = JSON.parse(bodyMessage);
    const input = updateMessage.message?.text?.toLowerCase() || "";

    let response;

    if (input == "/start") {
      response = handleTextRequest("/start", awsAccountID, updateMessage);
      await sendToSqs(response, region);
      response = handleTextRequest("/map", awsAccountID, updateMessage);
      await sendToSqs(response, region);
      response = handleTextRequest("/info", awsAccountID, updateMessage);
      await sendToSqs(response, region);
      response = handleTextRequest("/reminder", awsAccountID, updateMessage);
      await sendToSqs(response, region);
    }

    if (updateMessage.message?.photo) {
      const photos: PhotoSize[] = updateMessage.message.photo;
      let photo: PhotoSize = photos[photos.length - 1];
      response = handlePhotoRequest(photo, awsAccountID, updateMessage);



      await sendToSqs(response, region);
    }

  } catch (error) {
    console.error(error);
    throw error;
  }
}




const handlePhotoRequest = (input: PhotoSize, awsAccountID: string, updateMessage: UpdateMessage) => {
  const region = process.env.AWS_REGION;
  const qname = process.env.DownloadQueueName;
  const queueUrl = `https://sqs.${region}.amazonaws.com/${awsAccountID}/${qname}`;
  const chat_id: number = updateMessage.message?.chat?.id || 0;
  const user_id: number = updateMessage.message?.from.id || 0;
  const outgoingMessage = {
    user_id: user_id,
    chat_id: chat_id,
    photo: input
  };

  if (outgoingMessage) {
    const params = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(outgoingMessage),
      MessageGroupId: `${chat_id}`,
      MessageDeduplicationId: uuidv4(),
    };

    return {
      params,
    };
  }

  return {
  };
};

const handleTextRequest = (input: string, awsAccountID: string, updateMessage: UpdateMessage) => {
  const region = process.env.AWS_REGION;
  const qname = process.env.OutboundQueueName;
  const queueUrl = `https://sqs.${region}.amazonaws.com/${awsAccountID}/${qname}`;
  const chat_id: number = updateMessage.message?.chat?.id || 0;
  const outgoingMessage = prepareTextResponse(input, chat_id);

  if (outgoingMessage) {
    const params = {
      QueueUrl: queueUrl,
      MessageBody: outgoingMessage,
      MessageGroupId: `${chat_id}`,
      MessageDeduplicationId: uuidv4(),
    };

    return {
      params,
    };
  }

  return {
  };
};

const messages: Record<string, string[]> = {
  "/start": [
    "Merhaba, *Güvenli Oy Telegram Botu*na mesaj attınız\\.",
    "Oy Güvenliği Telegram Botu 28 Mayıs saat 17:00'ye kadar deaktif kalacaktır\\.",
    "28 Mayıs tarihinden sonra oy tutanaklarının gerekli yerlere hızlıca ulaşması için tutanak gönderme fonksiyonu açılacaktır\\.",
    "Ayrıca, eksik oy pusulalarının yerlerini görebilmeniz için eksik oy pusulası haritası da açılacaktır\\.",
    "Kısacası, Türkiye'nin her yerinden kolayca tüm tutanakları Telegram aracılığıyla gönderebileceksiniz\\.",
    "Bu süreç boyunca aşağıdaki butonlara tıklayarak eksik olan gözlemci yerlerini haritadan görebilir ve gönüllü olabilirsiniz\\.",
    "Ayrıca, gözlemciyseniz genel ipuçları için de butona tıklayabilirsiniz\\.",
  ],
  "/map": [
    "[secim\\.gonullu\\.io](https://secim\\.gonullu\\.io) adresinde seçim süreci boyunca eksik olan gözlemci bölgelerini görebilirsiniz\\.Buralarda eksik bölgelerde gönüllü olarak vatandaşlık görevinizi yerine getirebilirsiniz\\."
  ],
  "/info": [
    "Seçim sürecinde gözlemci iseniz, seçim bölgesine gitmeden önce lütfen yanınızda erzak ve mümkünse powerbank gibi yanınıza alabileceğiniz şeyler bulundurun\\. Sayım süreçleri sabah 06:00'ya kadar sürebilir ve bazen partiye özel gıda operasyonları gecikebilir\\.",
    "Önceki seçimde sandık başında 5 adet parti sandık sorumlusu bulunurken, bu sayı 2'ye düştü\\. Bu nedenle, gözlemciler seçim şeffaflığı açısından son derece önemli hale gelmektedir\\.",
    "Sonuç Tutanakları tüm tutanaklar sayıldıktan sonra imzanlanmalıdır\\.",
    "Herhangi bir usulsüzlük tespit ettiğinizde Barolar Birliği'nin Gözlemciler İçin hazırladığı PDF'yi inceleyebilirsiniz\\. [Link](https://t\\.co/pfN8IJ3kNo)",
  ],
  "/reminder": [
    "Gözlemci olarak ulaştığınız *ISLAK İMZALI* sonuç tutanak fotoğraflarını aşağıda gönderebilirsiniz\\.",
    "Haydi şimdi bir fotoğraf göndermeyi deneyin\\!"
  ]
};

// const buttons: Record<string, InlineKeyboardButton> = {
//   "gozlemcilikhakkinda": {
//     text: "Gözlemcilik Hakkında",
//     callback_data: "observerinfo",
//   },
//   "gozlemcilikharitasi": {
//     text: "Gözlemcilik Haritası",
//     callback_data: "observermap",
//   },
// }



function prepareTextResponse(input: string, chat_id: number) {

  // const input = updateMessage.message.text?.toLowerCase();
  var text: string | null = null;
  var reply_markup: string | null = null;
  switch (input) {
    case "/start":
    // const inlineKeyboard: InlineKeyboardMarkup = {
    //   inline_keyboard: [
    //     [
    //       buttons["gozlemcilikharitasi"],
    //     ],
    //     [
    //       buttons["gozlemcilikhakkinda"],
    //     ]
    //   ]
    // }
    // reply_markup = JSON.stringify(inlineKeyboard);

    default:
      text = messages[input]?.join('\n');
      break;
  }

  return JSON.stringify({
    chat_id: chat_id,
    text: text,
    reply_markup: reply_markup,
  })
}

