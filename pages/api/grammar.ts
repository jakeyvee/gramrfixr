import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing env var from OpenAI");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type Correction = {
  original: string;
  corrected: string;
  offset: number;
  length: number;
};

type Data = {
  result?: {
    corrections: Correction[];
  };
  error?: string;
};

function getIndicesOf(
  searchStr: string,
  content: string,
  caseSensitive = false
) {
  let searchStrLen = searchStr.length;
  if (searchStrLen == 0) {
    return [];
  }

  let startIndex = 0,
    index,
    indices = [];
  if (!caseSensitive) {
    content = content.toLowerCase();
    searchStr = searchStr.toLowerCase();
  }

  while ((index = content.indexOf(searchStr, startIndex)) > -1) {
    indices.push(index);
    startIndex = index + searchStrLen;
  }

  return indices;
}

function generatePrompt(message: string) {
  return `Pretend that you are a Dale Carnegie, the author of "How to Win Friends and Influence People". 
    Using the principles in the book, improve on the parts of the text by replying in JSON. 
    The JSON should contain a corrections array and for each object contains the original and corrected key.
    Only include words that are to be corrected, exclude words that do not need to be modified.
    The output should be json. 
    
    Here is my text: ${message}`;
}

const defaultErrorMessage = "Failed to process your request";
const defaultErrorStatus = 500;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    const content = req.body.content;

    if (!content) {
      console.log("Missing content");
      return res.status(defaultErrorStatus).json({ error: "Missing Content" });
    }

    let prompt = generatePrompt(content);

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 800,
      n: 1,
    });

    const response_content = (
      completion?.choices[0]?.message?.content ?? "[]"
    ).toString();
    const response = JSON.parse(response_content);
    console.log(response)

    console.log("corrections by openai :: ", response?.corrections);

    const finalResponse: Correction[] = [];

    for (const correction of response?.corrections) {
      // find all matching words with offset position
      const offsets = getIndicesOf(correction.original, content, true);
      // const offsets = [
      //   ...content.matchAll(new RegExp(correction.original, "gi")),
      // ].map((a) => a.index);

      if (offsets.length) {
        // create a new correction object with offset position
        for (const offset of offsets) {
          const newCorrectionObject: Correction = {
            original: correction.original,
            corrected: correction.corrected,
            offset: offset + 1,
            length: correction.original.length,
          };
          finalResponse.push(newCorrectionObject);
        }
      }
    }

    return res.status(200).json({
      result: {
        corrections: finalResponse,
      },
    });
  } catch (error: any) {
    if (error.response) {
      return res.status(error?.response?.status || defaultErrorStatus).json({
        error: error?.response?.data || defaultErrorMessage,
      });
    }

    return res
      .status(defaultErrorStatus)
      .json({ error: error?.message || defaultErrorMessage });
  }
}
