<script lang="ts">
	import { onMount } from 'svelte';

	interface ChatMessage {
		role: 'user' | 'assistant' | 'system';
		content: string;
	}

	let messages: ChatMessage[] = [];
	let userInput = '';
	let selectedModel = ''; // Will be populated from /api/ollama/tags
	let availableModels: string[] = [];
	let isLoading = false;
	let isLoadingModels = true;
	let errorMessage = '';

	onMount(async () => {
		// Fetch available models when the component mounts
		try {
			const response = await fetch('/api/ollama/tags');
			if (!response.ok) {
				const errorResult = await response.json();
				throw new Error(errorResult.error || `Failed to fetch models: ${response.status}`);
			}
			const data = await response.json();
			availableModels = data.models.map((model: any) => model.name);
			if (availableModels.length > 0) {
				selectedModel = availableModels[0]; // Default to the first model
			}
		} catch (err: any) {
			errorMessage = `Error loading models: ${err.message}`;
			console.error(err);
		} finally {
			isLoadingModels = false;
		}
	});

	async function handleSubmit() {
		if (!userInput.trim() || !selectedModel) {
			errorMessage = 'Please enter a message and select a model.';
			return;
		}
		isLoading = true;
		errorMessage = '';

		const newUserMessage: ChatMessage = { role: 'user', content: userInput };
		messages = [...messages, newUserMessage];

		// Prepare messages for Ollama (it expects the full history)
		const ollamaMessages = [...messages]; 
		// Optional: Add a system prompt if needed, e.g., 
		// if (ollamaMessages.length === 1) { 
		//   ollamaMessages.unshift({ role: 'system', content: 'You are a helpful assistant.' });
		// }

		userInput = ''; // Clear input

		try {
			const response = await fetch('/api/ollama/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: selectedModel,
					messages: ollamaMessages
				})
			});

			if (!response.ok || !response.body) {
				const errorResult = await response.json();
				throw new Error(errorResult.error || `Chat API error: ${response.status}`);
			}

			// Handle the stream
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let assistantMessageContent = '';
			// let firstChunk = true; // Not strictly needed with current logic

			messages = [...messages, { role: 'assistant', content: '...' }]; // Placeholder for assistant's message

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				// Ollama streams NDJSON (newline-delimited JSON)
				// Each line is a JSON object representing a part of the stream
				const lines = chunk.split('\n').filter(line => line.trim() !== '');

				for (const line of lines) {
					try {
						const parsedLine = JSON.parse(line);
						if (parsedLine.message && parsedLine.message.content) {
							assistantMessageContent += parsedLine.message.content;
							// Update the last message (assistant's) in the array
							messages = messages.map((msg, index) => 
								index === messages.length - 1 
									? { ...msg, content: assistantMessageContent } 
									: msg
							);
						}
						// if (parsedLine.done) { // Ollama's stream objects also have a 'done' boolean per chunk
						//	// console.log("Ollama stream part indicated done:", parsedLine);
						// }
					} catch (e) {
						console.error('Error parsing streamed JSON line:', e, "Line:", line);
					}
				}
			}
		} catch (err: any) {
			errorMessage = `Error sending message: ${err.message}`;
			console.error(err);
			// Remove placeholder if error occurred before assistant responded
			if (messages[messages.length -1]?.role === 'assistant' && messages[messages.length -1]?.content === '...') {
				messages = messages.slice(0, -1);
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Ollama Chat</title>
</svelte:head>

<div class="chat-container">
	<h1>SvelteKit Ollama Chat</h1>

	{#if isLoadingModels}
		<p>Loading models...</p>
	{:else if availableModels.length > 0}
		<div class="model-selector">
			<label for="model-select">Select Model:</label>
			<select id="model-select" bind:value={selectedModel}>
				{#each availableModels as modelName}
					<option value={modelName}>{modelName}</option>
				{/each}
			</select>
		</div>
	{:else if !errorMessage}
        <p>No models available or failed to load. Check <a href="/api/ollama/tags" target="_blank">/api/ollama/tags</a> or server logs.</p>
    {/if}

	<div class="messages-window">
		{#each messages as message (message.role + message.content + Math.random())} <!-- Basic keying, consider more robust keys for production -->
			<div class="message {message.role}">
				<strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong>
				<p>{message.content}</p>
			</div>
		{/each}
		{#if isLoading && messages[messages.length -1]?.role !== 'assistant'}
			 <div class="message assistant"><p>Assistant is thinking...</p></div>
		{/if}
	</div>

	<form on:submit|preventDefault={handleSubmit} class="input-area">
		<input
			type="text"
			bind:value={userInput}
			placeholder="Type your message..."
			disabled={isLoading || isLoadingModels || availableModels.length === 0}
		/>
		<button type="submit" disabled={isLoading || isLoadingModels || availableModels.length === 0}>
			{#if isLoading}Sending...{:else}Send{/if}
		</button>
	</form>

	{#if errorMessage}
		<p class="error-message">{errorMessage}</p>
	{/if}
</div>

<style>
	.chat-container {
		max-width: 700px;
		margin: 20px auto;
		padding: 20px;
		font-family: sans-serif;
		border: 1px solid #ccc;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		height: 80vh; /* Limit height to enable scrolling for messages */
		box-sizing: border-box;
	}
	.model-selector {
		margin-bottom: 15px;
		display: flex;
		align-items: center;
	}
	.model-selector label {
		margin-right: 10px;
	}
	.model-selector select {
		padding: 8px;
		border-radius: 4px;
		border: 1px solid #ddd;
	}
	.messages-window {
		flex-grow: 1; /* Allows this area to expand and fill available space */
		border: 1px solid #eee;
		padding: 10px;
		margin-bottom: 10px;
		overflow-y: auto; /* Enables scrolling for messages */
		background-color: #f9f9f9;
		border-radius: 4px;
	}
	.message {
		margin-bottom: 10px;
		padding: 8px 12px; /* Added a bit more padding */
		border-radius: 6px; /* Slightly more rounded */
		word-wrap: break-word; /* Ensure long words break */
	}
	.message.user {
		background-color: #dcf8c6; /* WhatsApp-like green */
		margin-left: auto; /* Align user messages to the right */
		max-width: 80%;
	}
	.message.assistant {
		background-color: #fff; /* White for assistant */
		border: 1px solid #eee;
		margin-right: auto; /* Align assistant messages to the left */
		max-width: 80%;
	}
	.message strong {
		display: block;
		font-size: 0.8em;
		margin-bottom: 2px;
		color: #555;
	}
	.message p {
		margin: 0;
		white-space: pre-wrap; /* Preserve line breaks in messages */
		line-height: 1.4;
	}
	.input-area {
		display: flex;
		margin-top: auto; /* Pushes input to the bottom if container has fixed height */
	}
	.input-area input {
		flex-grow: 1;
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 18px 0 0 18px; /* More rounded input */
		outline: none;
	}
	.input-area input:focus {
		border-color: #007bff;
	}
	.input-area button {
		padding: 10px 15px;
		border: none;
		background-color: #007bff;
		color: white;
		border-radius: 0 18px 18px 0; /* More rounded button */
		cursor: pointer;
		transition: background-color 0.2s;
	}
	.input-area button:hover {
		background-color: #0056b3;
	}
	.input-area button:disabled {
		background-color: #ccc;
		cursor: not-allowed;
	}
	.error-message {
		color: red;
		margin-top: 10px;
		text-align: center;
	}
</style>
