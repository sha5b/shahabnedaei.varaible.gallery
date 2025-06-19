// src/routes/api/ollama/tags/+server.ts
import { OLLAMA_API_URL } from '$env/static/private';
import { json, type RequestHandler } from '@sveltejs/kit';

interface OllamaTag {
	name: string;
	model: string;
	modified_at: string;
	size: number;
	digest: string;
	details: {
		format: string;
		family: string;
		families: string[] | null;
		parameter_size: string;
		quantization_level: string;
	};
}

interface OllamaTagsResponse {
	models: OllamaTag[];
}

export const GET: RequestHandler = async ({ fetch }) => {
	if (!OLLAMA_API_URL) {
		console.error('OLLAMA_API_URL is not defined in environment variables.');
		return json(
			{ error: 'Application is not configured to connect to Ollama service.' },
			{ status: 500 }
		);
	}

	try {
		const ollamaServiceUrl = `${OLLAMA_API_URL}/api/tags`;
		console.log(`Fetching tags from Ollama service: ${ollamaServiceUrl}`);

		const response = await fetch(ollamaServiceUrl);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Error from Ollama service (${response.status}): ${errorText}`);
			return json(
				{ error: `Ollama service error: ${response.status} - ${errorText}` },
				{ status: response.status }
			);
		}

		const data = (await response.json()) as OllamaTagsResponse;
		return json(data);
	} catch (error: unknown) {
		console.error('Failed to fetch from Ollama service:', error);
		
		let errorMessage = 'An unexpected error occurred while trying to connect to the Ollama service.';
		let errorStatus = 500;

		// Check if the error is a network error (e.g., ECONNREFUSED) which is common for connection issues
		if (error instanceof Error && (error as any).cause && (error as any).cause.code === 'ECONNREFUSED') {
			errorMessage = `Failed to connect to Ollama service at ${OLLAMA_API_URL}. Ensure the service is running and accessible.`;
			errorStatus = 503; // Service Unavailable
		}
		
		return json({ error: errorMessage }, { status: errorStatus });
	}
};
