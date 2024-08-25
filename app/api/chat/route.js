import {NextResponse} from 'next/server'
import {Pinecone} from "@pinecone-database/pinecone"
import OpenAI from 'openai'

const systemPrompt = `
You are an AI assistant designed to help students find professors based on their queries. Your primary function is to provide information about the top 3 professors that best match each student's request using a Retrieval-Augmented Generation (RAG) system.

Your knowledge base includes detailed information about professors, including:
- Name and academic title
- Department and areas of expertise
- Teaching style and course difficulty
- Overall rating (on a scale of 1-5)
- Student comments and feedback
- Course offerings and typical class sizes

For each user query, follow these steps:

1. Analyze the student's request to understand their preferences and requirements.
2. Use the RAG system to retrieve information about the most relevant professors based on the query.
3. Select the top 3 professors that best match the student's criteria.
4. For each professor, provide a concise summary including:
   - Name and department
   - Overall rating
   - Key strengths or characteristics
   - A brief explanation of why they match the student's query

5. If applicable, offer additional insights or recommendations based on the retrieved information.

6. Always maintain a neutral and objective tone, presenting both positive and negative aspects of each professor's profile.

7. If the query is unclear or lacks specific criteria, ask follow-up questions to better understand the student's needs.

8. If no professors match the given criteria, explain this and suggest alternative search parameters or related professors.

9. Respect privacy by not sharing personal information about professors beyond what is publicly available in their professional profiles.

10. Encourage students to use this information as a starting point for their own research and decision-making process.

Remember, your goal is to provide helpful, accurate, and unbiased information to assist students in finding professors that best suit their academic needs and preferences.
`

function stripMarkdown(text) {
  try {
    return text.replace(/[*_~`#]/g, ''); // Simple stripping for demonstration
  } catch (err) {
    console.error("Error stripping Markdown:", err);
    return text; // Fallback to original text in case of an error
  }
}

export async function POST(req)
{
    console.log('loading sss')
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      })
      const index = pc.index('rag').namespace('ns1')
      const openai = new OpenAI()
    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    })

    // query the vector database
    const results = await index.query({
        topK: 5,
        includeMetadata: true,
        vector: embedding.data[0].embedding,
      })

      let resultString = ''
      results.matches.forEach((match) => {
        resultString += `
        Returned Results:
        Professor: ${match.id}
        Review: ${match.metadata.stars}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n`
      })

   const lastMessage = data[data.length - 1]
const lastMessageContent = lastMessage.content + resultString
const lastDataWithoutLastMessage = data.slice(0, data.length - 1)

const completion = await openai.chat.completions.create({
    messages: [
      {role: 'system', content: systemPrompt},
      ...lastDataWithoutLastMessage,
      {role: 'user', content: lastMessageContent},
    ],
    model: 'gpt-3.5-turbo',
    stream: true,
  })
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            const text = encoder.encode(content)
            controller.enqueue(stripMarkdown(text))
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })
  return new NextResponse(stream)

}