// src/routes/api/ollama/chat/+server.ts
import { OLLAMA_API_URL } from '$env/static/private';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, fetch }) => {
	if (!OLLAMA_API_URL) {
		console.error('OLLAMA_API_URL is not defined in environment variables.');
		return new Response(
			JSON.stringify({ error: 'Application is not configured to connect to Ollama service.' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}

	try {
		const requestBody = await request.json();
		const { model, messages } = requestBody;

		if (!model || !messages) {
			return new Response(JSON.stringify({ error: 'Missing model or messages in request body.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const ollamaChatUrl = `${OLLAMA_API_URL}/api/chat`;
		console.log(`Forwarding chat request to Ollama: ${ollamaChatUrl} for model ${model}`);

		const ollamaResponse = await fetch(ollamaChatUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model,
				messages,
				stream: true // Ensure streaming is enabled
			})
		});

		if (!ollamaResponse.ok) {
			const errorText = await ollamaResponse.text();
			console.error(`Error from Ollama chat service (${ollamaResponse.status}): ${errorText}`);
			return new Response(
				JSON.stringify({ error: `Ollama service error: ${ollamaResponse.status} - ${errorText}` }),
				{ status: ollamaResponse.status, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Forward the stream from Ollama directly to the client
		// Ensure the 'content-type' is 'application/x-ndjson' or similar if Ollama sets it,
		// or let the browser infer. For simplicity, we'll rely on SvelteKit/fetch to handle this.
		// SvelteKit's `Response` can take a ReadableStream directly.
		return new Response(ollamaResponse.body, {
			status: 200,
			headers: {
				// Ollama typically sends 'application/x-ndjson' for streamed chat.
				// Forwarding this helps the client parse the stream correctly.
				'Content-Type': ollamaResponse.headers.get('Content-Type') || 'application/x-ndjson',
				'Transfer-Encoding': 'chunked' // Often used with streaming
			}
		});

	} catch (error: unknown) {
		console.error('Error in chat API endpoint:', error);
		let errorMessage = 'An unexpected error occurred in the chat API.';
		let errorStatus = 500;

		if (error instanceof Error && (error as any).cause?.code === 'ECONNREFUSED') {
			errorMessage = `Failed to connect to Ollama service at ${OLLAMA_API_URL}. Ensure the service is running and accessible.`;
			errorStatus = 503;
		} else if (error instanceof SyntaxError) {
			// Likely an issue with request.json() if the body wasn't valid JSON
			errorMessage = 'Invalid JSON in request body.';
			errorStatus = 400;
		}
		
		return new Response(JSON.stringify({ error: errorMessage }), {
			status: errorStatus,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
