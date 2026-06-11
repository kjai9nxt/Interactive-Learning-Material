# Building Blocks of AI Agents

This reading material introduces the core building blocks you need to understand
how a modern AI agent works, end to end.

## The agent loop

An AI agent is a program that uses a language model to decide which actions to
take. It runs in a loop: observe the current state, choose a tool, execute it,
and feed the result back into the model. The loop ends when the model decides the
task is complete.

## Tool calling

Tool calling lets the model request that the host program run a specific
function, such as a web search or a calculator, and return the result to the
model. The model does not run the function itself; it asks the host program to
run it and waits for the output.

## System prompt

A system prompt is a fixed instruction given to the model before the conversation
starts. It sets the agent's role, rules, and output format. It is provided once,
ahead of any user message.

## Retrieval-augmented generation (RAG)

Retrieval-augmented generation (RAG) fetches relevant passages from a document
store and adds them to the prompt, so the model can answer using information it
was never trained on. The model's weights are not changed; only the prompt is
extended with the retrieved text.

## Human-in-the-loop gate

A human-in-the-loop gate requires a person to approve the agent's output before
it takes effect. Until a reviewer approves, the proposed action does not run.
